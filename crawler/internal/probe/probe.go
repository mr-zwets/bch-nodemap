// Package probe performs a single P2P handshake with a node and asks it for
// the addresses it knows (version -> verack -> getaddr -> addr/addrv2) and,
// optionally, for a header that proves which chain it follows.
package probe

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net"
	"time"

	"github.com/gcash/bchd/wire"

	"github.com/bch-nodemap/bch-nodemap/crawler/internal/network"
)

// UserAgent identifies the crawler to node operators (BIP 14).
const UserAgent = "/bch-nodemap:0.1/"

// Dialer abstracts direct TCP vs a SOCKS proxy (Tor).
type Dialer interface {
	DialContext(ctx context.Context, network, addr string) (net.Conn, error)
}

type Options struct {
	Magic          wire.BitcoinNet
	DialTimeout    time.Duration // TCP connect
	HandshakeLimit time.Duration // until version+verack are exchanged
	AddrWait       time.Duration // how long to wait for the getaddr (and chain check) response
	ChainCheck     *network.ChainCheck
}

// Chain is the outcome of the chain check.
type Chain int

const (
	ChainUnknown Chain = iota // not checked, or no usable answer (e.g. still syncing)
	ChainOK                   // answered with the expected header
	ChainOther                // answered with headers of a different chain
)

type Result struct {
	ProtocolVersion int32
	UserAgent       string
	Services        uint64
	Height          int32
	Latency         time.Duration // connect + until their version arrived
	Addrs           []*wire.NetAddressV2
	Chain           Chain
}

// Probe connects to addr ("host:port"), completes a handshake and collects
// addr/addrv2 gossip. A non-nil Result means the handshake succeeded, even if
// the address request returned nothing.
func Probe(ctx context.Context, d Dialer, addr string, o Options) (*Result, error) {
	start := time.Now()
	dctx, cancel := context.WithTimeout(ctx, o.DialTimeout)
	conn, err := d.DialContext(dctx, "tcp", addr)
	cancel()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Deadline for the whole conversation; also unblocks reads on ctx cancel.
	deadline := start.Add(o.DialTimeout + o.HandshakeLimit + o.AddrWait)
	_ = conn.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = conn.SetDeadline(time.Now()) })
	defer stop()

	send := func(m wire.Message) error {
		return wire.WriteMessage(conn, m, wire.ProtocolVersion, o.Magic)
	}

	you := wire.NewNetAddressIPPort(net.IPv4zero, 0, 0)
	if tcp, ok := conn.RemoteAddr().(*net.TCPAddr); ok {
		you = wire.NewNetAddressIPPort(tcp.IP, uint16(tcp.Port), 0)
	}
	me := wire.NewNetAddressIPPort(net.IPv4zero, 0, 0)
	ver := wire.NewMsgVersion(me, you, rand.Uint64(), 0)
	ver.UserAgent = UserAgent
	ver.Services = 0
	ver.DisableRelayTx = true
	if err := send(ver); err != nil {
		return nil, err
	}

	var (
		res          *Result
		gotVerack    bool
		sentGetaddr  bool
		gotAddrs     bool
		addrDeadline time.Time
		chainPending = o.ChainCheck != nil
	)
	handshakeDeadline := start.Add(o.DialTimeout + o.HandshakeLimit)
	_ = conn.SetReadDeadline(handshakeDeadline)

	for {
		msg, _, err := wire.ReadMessage(conn, wire.ProtocolVersion, o.Magic)
		if err != nil {
			var me *wire.MessageError
			if errors.As(err, &me) {
				// Unknown or malformed message; its payload has been
				// discarded, so the stream is still in sync.
				continue
			}
			if res != nil && sentGetaddr {
				// Handshake succeeded; a timeout here just ends the address wait.
				return res, nil
			}
			if res != nil {
				return res, fmt.Errorf("after version: %w", err)
			}
			return nil, err
		}

		switch m := msg.(type) {
		case *wire.MsgVersion:
			res = &Result{
				ProtocolVersion: m.ProtocolVersion,
				UserAgent:       m.UserAgent,
				Services:        uint64(m.Services),
				Height:          m.LastBlock,
				Latency:         time.Since(start),
			}
			// BIP155: sendaddrv2 must arrive between version and verack.
			if err := send(wire.NewMsgSendAddrV2()); err != nil {
				return res, err
			}
			if err := send(wire.NewMsgVerAck()); err != nil {
				return res, err
			}
		case *wire.MsgVerAck:
			gotVerack = true
		case *wire.MsgPing:
			_ = send(wire.NewMsgPong(m.Nonce))
		case *wire.MsgAddr:
			for _, na := range m.AddrList {
				res.Addrs = append(res.Addrs, wire.NetAddressV2FromLegacy(na))
			}
			if sentGetaddr && len(m.AddrList) > 1 {
				gotAddrs = true // the getaddr response; single entries are self-announcements
			}
		case *wire.MsgAddrV2:
			res.Addrs = append(res.Addrs, m.AddrList...)
			if sentGetaddr && len(m.AddrList) > 1 {
				gotAddrs = true
			}
		case *wire.MsgHeaders:
			// An empty answer proves nothing: the peer may know Block but not
			// be past it.
			if chainPending && sentGetaddr && len(m.Headers) > 0 {
				chainPending = false
				if m.Headers[0].PrevBlock == o.ChainCheck.Block {
					res.Chain = ChainOK
				} else {
					res.Chain = ChainOther
				}
			}
		}
		if gotAddrs && !chainPending {
			return res, nil
		}

		if res != nil && gotVerack && !sentGetaddr {
			if err := send(wire.NewMsgGetAddr()); err != nil {
				return res, nil
			}
			if o.ChainCheck != nil {
				gh := wire.NewMsgGetHeaders()
				gh.HashStop = o.ChainCheck.Next
				_ = gh.AddBlockLocatorHash(&o.ChainCheck.Block)
				if err := send(gh); err != nil {
					return res, nil
				}
			}
			sentGetaddr = true
			addrDeadline = time.Now().Add(o.AddrWait)
			_ = conn.SetReadDeadline(addrDeadline)
		}
	}
}
