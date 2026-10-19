// Package store writes snapshots to Postgres (schema: db/migrations).
package store

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Node struct {
	Address         string
	Port            int
	Net             string // ipv4 | ipv6 | onion | i2p | cjdns
	ProtocolVersion int32
	UserAgent       string
	Services        uint64
	Height          int32
	FirstSeen       time.Time
	LatencyMs       *int
	Hostname        string
	Country         string
	City            string
	Lat, Lon        *float64
	Timezone        string
	ASN             int
	Org             string
}

type Snapshot struct {
	TakenAt    time.Time
	Source     string // crawler | cashnodes
	Network    string
	Discovered *int
	DurationMs *int
	Nodes      []Node
}

type Endpoint struct {
	Address   string
	Port      int
	FirstSeen time.Time
}

type Store struct{ pool *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// ErrExists is returned when a snapshot with the same (network, source, taken_at) is stored already.
var ErrExists = errors.New("snapshot already stored")

// Known returns endpoints seen reachable since the given time, to re-seed a crawl
// and to carry first_seen forward.
func (s *Store) Known(ctx context.Context, network string, since time.Time) ([]Endpoint, error) {
	rows, err := s.pool.Query(ctx,
		`select address, port, first_seen from nodes where network = $1 and last_seen >= $2`,
		network, since)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Endpoint, error) {
		var e Endpoint
		err := r.Scan(&e.Address, &e.Port, &e.FirstSeen)
		return e, err
	})
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(i int) any {
	if i == 0 {
		return nil
	}
	return i
}

// Save stores a snapshot and its nodes in one transaction. For crawler
// snapshots it also updates the nodes table.
func (s *Store) Save(ctx context.Context, snap Snapshot) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var id int64
	err = tx.QueryRow(ctx, `
		insert into snapshots (taken_at, source, network, reachable, discovered, duration_ms)
		values ($1, $2, $3, $4, $5, $6)
		on conflict (network, source, taken_at) do nothing
		returning id`,
		snap.TakenAt, snap.Source, snap.Network, len(snap.Nodes), snap.Discovered, snap.DurationMs,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrExists
	}
	if err != nil {
		return 0, err
	}

	rows := make([][]any, 0, len(snap.Nodes))
	seen := make(map[string]bool, len(snap.Nodes))
	for _, n := range snap.Nodes {
		key := n.Address + "|" + strconv.Itoa(n.Port)
		if seen[key] {
			continue
		}
		seen[key] = true
		var firstSeen any
		if !n.FirstSeen.IsZero() {
			firstSeen = n.FirstSeen
		}
		rows = append(rows, []any{
			id, n.Address, n.Port, n.Net, n.ProtocolVersion, nullStr(n.UserAgent), int64(n.Services),
			n.Height, firstSeen, n.LatencyMs, nullStr(n.Hostname), nullStr(n.Country), nullStr(n.City),
			n.Lat, n.Lon, nullStr(n.Timezone), nullInt(n.ASN), nullStr(n.Org),
		})
	}
	_, err = tx.CopyFrom(ctx, pgx.Identifier{"snapshot_nodes"}, []string{
		"snapshot_id", "address", "port", "net", "protocol_version", "user_agent", "services",
		"height", "first_seen", "latency_ms", "hostname", "country", "city",
		"lat", "lon", "timezone", "asn", "org",
	}, pgx.CopyFromRows(rows))
	if err != nil {
		return 0, err
	}

	if snap.Source == "crawler" {
		batch := &pgx.Batch{}
		for _, n := range snap.Nodes {
			batch.Queue(`
				insert into nodes (network, address, port, net, first_seen, last_seen, last_user_agent)
				values ($1, $2, $3, $4, $5, $6, $7)
				on conflict (network, address, port) do update
				set last_seen = excluded.last_seen, last_user_agent = excluded.last_user_agent`,
				snap.Network, n.Address, n.Port, n.Net, n.FirstSeen, snap.TakenAt, nullStr(n.UserAgent))
		}
		if err := tx.SendBatch(ctx, batch).Close(); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit(ctx)
}
