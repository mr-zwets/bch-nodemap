package probe

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/gcash/bchd/wire"
)

const torV3Host = "pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion"

// fakePeer accepts one connection and plays the node side of the handshake.
// It sends a single-entry self-announcement before the real getaddr answer,
// like BCHN does, and answers getaddr with addrv2 if we asked for it.
func fakePeer(t *testing.T, magic wire.BitcoinNet, userAgent string) (string, <-chan bool) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	gotSendAddrV2 := make(chan bool, 1)

	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		send := func(m wire.Message) { _ = wire.WriteMessage(c, m, wire.ProtocolVersion, magic) }
		wantsV2 := false
		for {
			msg, _, err := wire.ReadMessage(c, wire.ProtocolVersion, magic)
			if err != nil {
				return
			}
			switch msg.(type) {
			case *wire.MsgVersion:
				me := wire.NewNetAddressIPPort(net.IPv4(127, 0, 0, 1), 8333, wire.SFNodeNetwork)
				v := wire.NewMsgVersion(me, me, 42, 973532)
				v.UserAgent = userAgent
				v.Services = wire.SFNodeNetwork
				send(v)
				send(&wire.MsgPing{Nonce: 7}) // probe must answer pings
			case *wire.MsgSendAddrV2:
				wantsV2 = true
			case *wire.MsgVerAck:
				gotSendAddrV2 <- wantsV2
				send(wire.NewMsgVerAck())
				self := wire.NewMsgAddr()
				_ = self.AddAddress(wire.NewNetAddressIPPort(net.IPv4(127, 0, 0, 1), 8333, 0))
				send(self)
			case *wire.MsgGetAddr:
				tor, _ := wire.DecodeTorV3(torV3Host)
				resp := wire.NewMsgAddrV2()
				resp.AddrList = []*wire.NetAddressV2{
					wire.NewNetAddressV2IPPort(net.ParseIP("203.0.113.5"), 8333, 0),
					wire.NewNetAddressV2IPPort(net.ParseIP("1.2.3.4"), 8333, 0),
					wire.NewNetAddressV2(wire.NetworkTorV3, tor, 8333, 0),
				}
				if wantsV2 {
					send(resp)
				}
			}
		}
	}()
	return ln.Addr().String(), gotSendAddrV2
}

func opts(magic wire.BitcoinNet) Options {
	return Options{Magic: magic, DialTimeout: 2 * time.Second, HandshakeLimit: 2 * time.Second, AddrWait: 2 * time.Second}
}

func TestProbeHandshakeAndAddrV2(t *testing.T) {
	addr, sendAddrV2 := fakePeer(t, wire.MainNet, "/Bitcoin Cash Node:29.2.0/")

	res, err := Probe(context.Background(), &net.Dialer{}, addr, opts(wire.MainNet))
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if !<-sendAddrV2 {
		t.Error("sendaddrv2 was not sent before verack")
	}
	if res.UserAgent != "/Bitcoin Cash Node:29.2.0/" || res.Height != 973532 || res.Services != uint64(wire.SFNodeNetwork) {
		t.Errorf("unexpected version info: %+v", res)
	}
	// 1 self-announcement + 3 from getaddr
	if len(res.Addrs) != 4 {
		t.Fatalf("got %d addrs, want 4", len(res.Addrs))
	}
	last := res.Addrs[3]
	if last.Network != wire.NetworkTorV3 || last.Host() != torV3Host {
		t.Errorf("tor v3 address decoded as %v %q", last.Network, last.Host())
	}
}

func TestProbeWrongMagicFails(t *testing.T) {
	addr, _ := fakePeer(t, wire.MainNet, "/x:1/")
	res, err := Probe(context.Background(), &net.Dialer{}, addr, opts(wire.TestNet4))
	if err == nil || res != nil {
		t.Fatalf("expected handshake failure across networks, got res=%v err=%v", res, err)
	}
}
