// Command crawler periodically crawls the Bitcoin Cash P2P network and stores
// a snapshot of all reachable nodes in Postgres.
package main

import (
	"context"
	"flag"
	"log/slog"
	"net"
	"net/netip"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/net/proxy"

	"github.com/bch-nodemap/bch-nodemap/crawler/internal/crawl"
	"github.com/bch-nodemap/bch-nodemap/crawler/internal/geo"
	"github.com/bch-nodemap/bch-nodemap/crawler/internal/network"
	"github.com/bch-nodemap/bch-nodemap/crawler/internal/probe"
	"github.com/bch-nodemap/bch-nodemap/crawler/internal/store"
)

func main() {
	var (
		netName   = flag.String("network", "mainnet", "mainnet | testnet4 | chipnet | regtest")
		dbURL     = flag.String("db", env("DATABASE_URL", "postgres://nodemap@127.0.0.1:5433/nodemap"), "Postgres URL")
		interval  = flag.Duration("interval", 10*time.Minute, "time between crawl starts")
		once      = flag.Bool("once", false, "run a single crawl and exit")
		dryRun    = flag.Bool("dry-run", false, "crawl but do not write to the database")
		workers   = flag.Int("workers", 500, "concurrent connections")
		connect   = flag.String("connect", "", "comma-separated host:port list to start from (in addition to seeds)")
		noSeeds   = flag.Bool("no-dns-seeds", false, "do not query DNS seeds")
		torProxy  = flag.String("tor", "", "SOCKS5 proxy for .onion nodes, e.g. 127.0.0.1:9050")
		geoCity   = flag.String("geoip-city", env("GEOIP_CITY", ".local/geoip/dbip-city-lite.mmdb"), "city .mmdb (empty to disable)")
		geoASN    = flag.String("geoip-asn", env("GEOIP_ASN", ".local/geoip/dbip-asn-lite.mmdb"), "ASN .mmdb (empty to disable)")
		rdns      = flag.Bool("rdns", true, "reverse-resolve hostnames of reachable nodes")
		exclude   = flag.String("exclude-ua", "Bitcoin ABC,eCash,Lotus,Bitcoin SV", "comma-separated user agent substrings to drop")
		maxAge    = flag.Duration("max-addr-age", 24*time.Hour, "ignore gossiped addresses older than this")
		debug     = flag.Bool("debug", false, "verbose logging")
		allowPriv = flag.Bool("allow-private", false, "accept private/loopback addresses (default true on regtest)")
	)
	flag.Parse()

	level := slog.LevelInfo
	if *debug {
		level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})))

	params, err := network.ByName(*netName)
	if err != nil {
		fatal(err)
	}
	if params.Name == "regtest" {
		*allowPriv = true
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	var db *store.Store
	if !*dryRun {
		if db, err = store.Open(ctx, *dbURL); err != nil {
			fatal(err)
		}
		defer db.Close()
	}

	geodb, err := geo.Open(existing(*geoCity), existing(*geoASN))
	if err != nil {
		fatal(err)
	}
	defer geodb.Close()

	cfg := crawl.Config{
		Net:     params,
		Workers: *workers,
		Probe: probe.Options{
			Magic:          params.Magic,
			DialTimeout:    10 * time.Second,
			HandshakeLimit: 15 * time.Second,
			AddrWait:       20 * time.Second,
		},
		Direct:            &net.Dialer{},
		MaxAddrAge:        *maxAge,
		MaxEndpoints:      100_000,
		AllowPrivate:      *allowPriv,
		ExcludeUserAgents: splitList(*exclude),
	}
	if *torProxy != "" {
		d, err := proxy.SOCKS5("tcp", *torProxy, nil, proxy.Direct)
		if err != nil {
			fatal(err)
		}
		cfg.Tor = d.(proxy.ContextDialer)
	}

	for {
		runOnce(ctx, cfg, db, geodb, *connect, !*noSeeds, *rdns)
		if *once || ctx.Err() != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(*interval):
		}
	}
}

func runOnce(ctx context.Context, cfg crawl.Config, db *store.Store, geodb *geo.DB, connect string, useSeeds, rdns bool) {
	firstSeen := map[string]time.Time{}
	var start []crawl.Endpoint

	if db != nil {
		known, err := db.Known(ctx, cfg.Net.Name, time.Now().Add(-7*24*time.Hour))
		if err != nil {
			slog.Error("loading known nodes", "err", err)
		}
		for _, k := range known {
			firstSeen[key(k.Address, k.Port)] = k.FirstSeen
			if e, ok := parseEndpoint(net.JoinHostPort(k.Address, strconv.Itoa(k.Port)), cfg.Net.DefaultPort); ok {
				start = append(start, e)
			}
		}
	}
	for _, c := range splitList(connect) {
		if e, ok := parseEndpoint(c, cfg.Net.DefaultPort); ok {
			start = append(start, e)
		} else {
			slog.Warn("bad -connect entry", "addr", c)
		}
	}
	if useSeeds {
		start = append(start, resolveSeeds(ctx, cfg.Net)...)
	}
	slog.Info("crawl starting", "network", cfg.Net.Name, "start_endpoints", len(start))

	res := crawl.Run(ctx, cfg, start)
	if ctx.Err() != nil {
		return
	}
	excluded := 0
	for ua, n := range res.Excluded {
		excluded += n
		slog.Debug("excluded user agent", "ua", ua, "count", n)
	}
	slog.Info("crawl finished", "reachable", len(res.Reachable), "excluded", excluded,
		"discovered", res.Discovered, "took", res.Duration.Round(time.Second))

	nodes := enrich(ctx, res, geodb, firstSeen, rdns)
	if db == nil {
		for _, n := range nodes {
			slog.Debug("node", "addr", n.Address, "port", n.Port, "ua", n.UserAgent, "height", n.Height, "country", n.Country)
		}
		return
	}
	discovered, durMs := res.Discovered, int(res.Duration.Milliseconds())
	id, err := db.Save(ctx, store.Snapshot{
		TakenAt:    res.Started.UTC().Truncate(time.Second),
		Source:     "crawler",
		Network:    cfg.Net.Name,
		Discovered: &discovered,
		DurationMs: &durMs,
		Nodes:      nodes,
	})
	if err != nil {
		slog.Error("saving snapshot", "err", err)
		return
	}
	slog.Info("snapshot saved", "id", id, "nodes", len(nodes))
}

// enrich adds geo, reverse DNS and first-seen data to each reachable node.
func enrich(ctx context.Context, res *crawl.Result, geodb *geo.DB, firstSeen map[string]time.Time, rdns bool) []store.Node {
	nodes := make([]store.Node, len(res.Reachable))
	sem := make(chan struct{}, 64)
	var wg sync.WaitGroup
	for i, r := range res.Reachable {
		lat := int(r.Latency.Milliseconds())
		n := store.Node{
			Address:         r.Host,
			Port:            int(r.Port),
			Net:             r.Net,
			ProtocolVersion: r.ProtocolVersion,
			UserAgent:       r.UserAgent,
			Services:        r.Services,
			Height:          r.Height,
			FirstSeen:       res.Started.UTC().Truncate(time.Second),
			LatencyMs:       &lat,
		}
		if fs, ok := firstSeen[key(n.Address, n.Port)]; ok {
			n.FirstSeen = fs
		}
		ip := net.ParseIP(r.Host)
		if ip != nil {
			g := geodb.Lookup(ip)
			n.Country, n.City, n.Lat, n.Lon, n.Timezone, n.ASN, n.Org =
				g.Country, g.City, g.Lat, g.Lon, g.Timezone, g.ASN, g.Org
		}
		nodes[i] = n
		if rdns && ip != nil {
			wg.Add(1)
			sem <- struct{}{}
			go func(i int, host string) {
				defer func() { <-sem; wg.Done() }()
				lctx, cancel := context.WithTimeout(ctx, 5*time.Second)
				defer cancel()
				if names, err := net.DefaultResolver.LookupAddr(lctx, host); err == nil && len(names) > 0 {
					nodes[i].Hostname = strings.TrimSuffix(names[0], ".")
				}
			}(i, r.Host)
		}
	}
	wg.Wait()
	return nodes
}

func resolveSeeds(ctx context.Context, p network.Params) []crawl.Endpoint {
	var (
		mu  sync.Mutex
		out []crawl.Endpoint
		wg  sync.WaitGroup
	)
	for _, seed := range p.DNSSeeds {
		wg.Add(1)
		go func() {
			defer wg.Done()
			lctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			ips, err := net.DefaultResolver.LookupNetIP(lctx, "ip", seed)
			if err != nil {
				slog.Warn("dns seed failed", "seed", seed, "err", err)
				return
			}
			mu.Lock()
			defer mu.Unlock()
			for _, ip := range ips {
				ip = ip.Unmap()
				n := "ipv4"
				if ip.Is6() {
					n = "ipv6"
				}
				out = append(out, crawl.Endpoint{Host: ip.String(), Port: p.DefaultPort, Net: n})
			}
		}()
	}
	wg.Wait()
	return out
}

func parseEndpoint(s string, defPort uint16) (crawl.Endpoint, bool) {
	host, portStr, err := net.SplitHostPort(s)
	if err != nil {
		host, portStr = s, strconv.Itoa(int(defPort))
	}
	port, err := strconv.ParseUint(portStr, 10, 16)
	if err != nil {
		return crawl.Endpoint{}, false
	}
	if strings.HasSuffix(host, ".onion") {
		return crawl.Endpoint{Host: host, Port: uint16(port), Net: "onion"}, true
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return crawl.Endpoint{}, false
	}
	ip = ip.Unmap()
	n := "ipv4"
	if ip.Is6() {
		n = "ipv6"
	}
	return crawl.Endpoint{Host: ip.String(), Port: uint16(port), Net: n}, true
}

func key(addr string, port int) string { return addr + "|" + strconv.Itoa(port) }

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func existing(path string) string {
	if path == "" {
		return ""
	}
	if _, err := os.Stat(path); err != nil {
		slog.Warn("geoip database not found, lookups disabled", "path", path)
		return ""
	}
	return path
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func fatal(err error) {
	slog.Error(err.Error())
	os.Exit(1)
}
