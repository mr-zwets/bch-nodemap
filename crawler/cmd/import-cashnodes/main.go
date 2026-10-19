// Command import-cashnodes loads historical Bitcoin Unlimited cashnodes
// snapshots (downloaded by archive/fetch_cashnodes.py) into Postgres with
// source = 'cashnodes'. Re-running it skips snapshots already imported.
//
// Each snapshot is a JSON array of nodes in the bitnodes export format:
//
//	[address, port, protocol_version, user_agent, first_seen_unix, services,
//	 height, hostname, city, country, lat, lon, timezone, "AS<n>", org]
package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bch-nodemap/bch-nodemap/crawler/internal/store"
)

func main() {
	dir := flag.String("dir", "archive/data/raw", "directory with <timestamp>.json.gz files")
	dbURL := flag.String("db", envOr("DATABASE_URL", "postgres://nodemap@127.0.0.1:5433/nodemap"), "Postgres URL")
	exclude := flag.String("exclude-ua", "Bitcoin ABC,eCash,Lotus,Bitcoin SV", "comma-separated user agent substrings to drop")
	flag.Parse()

	ctx := context.Background()
	db, err := store.Open(ctx, *dbURL)
	if err != nil {
		fatal(err)
	}
	defer db.Close()

	files, err := filepath.Glob(filepath.Join(*dir, "*.json.gz"))
	if err != nil {
		fatal(err)
	}
	sort.Strings(files)

	var excludes []string
	for _, s := range strings.Split(*exclude, ",") {
		if s = strings.TrimSpace(s); s != "" {
			excludes = append(excludes, s)
		}
	}

	imported, skipped := 0, 0
	for _, f := range files {
		snap, dropped, err := load(f, excludes)
		if err != nil {
			slog.Error("reading snapshot", "file", f, "err", err)
			continue
		}
		_, err = db.Save(ctx, snap)
		switch {
		case errors.Is(err, store.ErrExists):
			skipped++
		case err != nil:
			fatal(fmt.Errorf("%s: %w", f, err))
		default:
			imported++
			slog.Info("imported", "taken_at", snap.TakenAt.Format(time.RFC3339), "nodes", len(snap.Nodes), "excluded", dropped)
		}
	}
	slog.Info("done", "imported", imported, "already_present", skipped)
}

func load(path string, excludes []string) (store.Snapshot, int, error) {
	ts, err := strconv.ParseInt(strings.TrimSuffix(filepath.Base(path), ".json.gz"), 10, 64)
	if err != nil {
		return store.Snapshot{}, 0, fmt.Errorf("file name is not a timestamp: %w", err)
	}
	fh, err := os.Open(path)
	if err != nil {
		return store.Snapshot{}, 0, err
	}
	defer fh.Close()
	gz, err := gzip.NewReader(fh)
	if err != nil {
		return store.Snapshot{}, 0, err
	}
	var rows [][]any
	if err := json.NewDecoder(gz).Decode(&rows); err != nil {
		return store.Snapshot{}, 0, err
	}

	snap := store.Snapshot{TakenAt: time.Unix(ts, 0).UTC(), Source: "cashnodes", Network: "mainnet"}
	dropped := 0
rows:
	for _, r := range rows {
		if len(r) < 15 {
			continue
		}
		n := store.Node{
			Address:         str(r[0]),
			Port:            int(num(r[1])),
			ProtocolVersion: int32(num(r[2])),
			UserAgent:       str(r[3]),
			Services:        uint64(num(r[5])),
			Height:          int32(num(r[6])),
			City:            str(r[8]),
			Country:         str(r[9]),
			Timezone:        str(r[12]),
			Org:             str(r[14]),
		}
		for _, s := range excludes {
			if strings.Contains(n.UserAgent, s) {
				dropped++
				continue rows
			}
		}
		if fs := num(r[4]); fs > 0 {
			n.FirstSeen = time.Unix(int64(fs), 0).UTC()
		}
		// bitnodes stores the address itself when reverse DNS failed
		if h := str(r[7]); h != n.Address {
			n.Hostname = h
		}
		if r[10] != nil && r[11] != nil {
			lat, lon := num(r[10]), num(r[11])
			n.Lat, n.Lon = &lat, &lon
		}
		n.ASN, _ = strconv.Atoi(strings.TrimPrefix(str(r[13]), "AS"))
		switch {
		case strings.HasSuffix(n.Address, ".onion"):
			n.Net = "onion"
		case strings.Contains(n.Address, ":"):
			n.Net = "ipv6"
		default:
			n.Net = "ipv4"
		}
		snap.Nodes = append(snap.Nodes, n)
	}
	return snap, dropped, nil
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func num(v any) float64 {
	f, _ := v.(float64)
	return f
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func fatal(err error) {
	slog.Error(err.Error())
	os.Exit(1)
}
