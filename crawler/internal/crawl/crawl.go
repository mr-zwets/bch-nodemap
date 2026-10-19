// Package crawl walks the P2P network breadth-first: probe every known
// endpoint, add the addresses it gossips, repeat until nothing new is found.
package crawl

import (
	"context"
	"log/slog"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gcash/bchd/wire"

	"github.com/bch-nodemap/bch-nodemap/crawler/internal/network"
	"github.com/bch-nodemap/bch-nodemap/crawler/internal/probe"
)

type Config struct {
	Net          network.Params
	Workers      int
	Probe        probe.Options
	Direct       probe.Dialer
	Tor          probe.Dialer  // nil disables .onion probing
	MaxAddrAge   time.Duration // ignore gossiped addresses older than this
	MaxEndpoints int           // safety cap on the crawl set
	AllowPrivate bool          // accept private/loopback addresses (regtest)
	// ExcludeUserAgents drops nodes whose user agent contains any of these
	// strings (e.g. eCash nodes that share the BCH network magic). Their
	// gossip is not followed either.
	ExcludeUserAgents []string
}

type Endpoint struct {
	Host string // IP literal or onion/i2p hostname
	Port uint16
	Net  string // ipv4 | ipv6 | onion | i2p | cjdns
}

func (e Endpoint) String() string { return net.JoinHostPort(e.Host, strconv.Itoa(int(e.Port))) }

type Reachable struct {
	Endpoint
	*probe.Result
}

type Result struct {
	Started    time.Time
	Duration   time.Duration
	Reachable  []Reachable
	Discovered int            // distinct endpoints learned (probed or not)
	Excluded   map[string]int // user agent -> count, reachable but filtered
}

// Run crawls from the given starting endpoints until the frontier is empty.
func Run(ctx context.Context, cfg Config, start []Endpoint) *Result {
	res := &Result{Started: time.Now(), Excluded: map[string]int{}}

	var (
		mu      sync.Mutex
		seen    = map[Endpoint]bool{}
		pending sync.WaitGroup
		queue   = make(chan Endpoint, cfg.MaxEndpoints)
	)

	enqueue := func(e Endpoint) {
		mu.Lock()
		defer mu.Unlock()
		if seen[e] || len(seen) >= cfg.MaxEndpoints {
			return
		}
		seen[e] = true
		if e.Net == "i2p" || e.Net == "cjdns" || (e.Net == "onion" && cfg.Tor == nil) {
			return // recorded as discovered, but we have no transport for it
		}
		pending.Add(1)
		queue <- e
	}

	for _, e := range start {
		enqueue(e)
	}

	var workers sync.WaitGroup
	for range cfg.Workers {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for e := range queue {
				visit(ctx, cfg, e, res, &mu, enqueue)
				pending.Done()
			}
		}()
	}

	pending.Wait()
	close(queue)
	workers.Wait()

	res.Discovered = len(seen)
	res.Duration = time.Since(res.Started)
	return res
}

func visit(ctx context.Context, cfg Config, e Endpoint, res *Result, mu *sync.Mutex, enqueue func(Endpoint)) {
	if ctx.Err() != nil {
		return
	}
	dialer := cfg.Direct
	if e.Net == "onion" {
		dialer = cfg.Tor
	}
	r, err := probe.Probe(ctx, dialer, e.String(), cfg.Probe)
	if r == nil {
		slog.Debug("unreachable", "addr", e, "err", err)
		return
	}

	for _, s := range cfg.ExcludeUserAgents {
		if strings.Contains(r.UserAgent, s) {
			mu.Lock()
			res.Excluded[r.UserAgent]++
			mu.Unlock()
			return
		}
	}

	mu.Lock()
	res.Reachable = append(res.Reachable, Reachable{Endpoint: e, Result: r})
	mu.Unlock()

	cutoff := time.Now().Add(-cfg.MaxAddrAge)
	for _, na := range r.Addrs {
		if na.Timestamp.Before(cutoff) {
			continue
		}
		if ne, ok := endpointFrom(na, cfg.AllowPrivate); ok {
			enqueue(ne)
		}
	}
}

func endpointFrom(na *wire.NetAddressV2, allowPrivate bool) (Endpoint, bool) {
	if na.Port == 0 {
		return Endpoint{}, false
	}
	switch na.Network {
	case wire.NetworkIPv4, wire.NetworkIPv6:
		ip, ok := netip.AddrFromSlice(na.IP())
		if !ok {
			return Endpoint{}, false
		}
		ip = ip.Unmap()
		if !allowPrivate && !Routable(ip) {
			return Endpoint{}, false
		}
		n := "ipv4"
		if ip.Is6() {
			n = "ipv6"
		}
		return Endpoint{Host: ip.String(), Port: na.Port, Net: n}, true
	case wire.NetworkTorV3:
		return Endpoint{Host: na.Host(), Port: na.Port, Net: "onion"}, true
	case wire.NetworkI2P:
		return Endpoint{Host: na.Host(), Port: na.Port, Net: "i2p"}, true
	case wire.NetworkCJDNS:
		return Endpoint{Host: na.Host(), Port: na.Port, Net: "cjdns"}, true
	}
	return Endpoint{}, false // Tor v2 and unknown networks
}

var nonRoutable = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2001::/32"), // Teredo
	netip.MustParsePrefix("2002::/16"), // 6to4
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("fc00::/7"), // also covers CJDNS fc00::/8 as IPv6
}

// Routable reports whether ip is a public unicast address.
func Routable(ip netip.Addr) bool {
	if !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return false
	}
	for _, p := range nonRoutable {
		if p.Contains(ip) {
			return false
		}
	}
	return true
}
