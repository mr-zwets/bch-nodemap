package crawl

import (
	"net"
	"net/netip"
	"testing"

	"github.com/gcash/bchd/wire"
)

func TestRoutable(t *testing.T) {
	cases := map[string]bool{
		"1.2.3.4":        true,
		"2a01:4f8::1":    true,
		"10.0.0.1":       false,
		"192.168.1.1":    false,
		"127.0.0.1":      false,
		"100.64.1.1":     false, // CGNAT
		"203.0.113.9":    false, // TEST-NET-3
		"0.1.2.3":        false,
		"::1":            false,
		"fe80::1":        false,
		"fd00::1":        false,
		"2001:db8::1":    false,
		"2002:102:304::": false, // 6to4
	}
	for ip, want := range cases {
		if got := Routable(netip.MustParseAddr(ip)); got != want {
			t.Errorf("Routable(%s) = %v, want %v", ip, got, want)
		}
	}
}

func TestEndpointFrom(t *testing.T) {
	v4mapped := wire.NewNetAddressV2IPPort(net.ParseIP("::ffff:1.2.3.4"), 8333, 0)
	e, ok := endpointFrom(v4mapped, false)
	if !ok || e.Host != "1.2.3.4" || e.Net != "ipv4" {
		t.Errorf("v4-mapped: got %+v %v", e, ok)
	}

	private := wire.NewNetAddressV2IPPort(net.ParseIP("192.168.1.10"), 18444, 0)
	if _, ok := endpointFrom(private, false); ok {
		t.Error("private address accepted without allowPrivate")
	}
	if _, ok := endpointFrom(private, true); !ok {
		t.Error("private address rejected with allowPrivate")
	}

	torv2 := wire.NewNetAddressV2(wire.NetworkTorV2, make([]byte, 10), 8333, 0)
	if _, ok := endpointFrom(torv2, false); ok {
		t.Error("tor v2 should be ignored")
	}
}

func TestCleanUserAgent(t *testing.T) {
	cases := map[string]string{
		"/Bitcoin Cash Node:29.2.0/":         "/Bitcoin Cash Node:29.2.0/",
		"/Bitcoin Cash Node:29.2.0(EB32.0)/": "/Bitcoin Cash Node:29.2.0(EB32.0)/",
		"":                                   "",
		"/evil\x00node/":                     "/evilnode/",
		"/bad\xff\xfeutf8/":                  "/bad�utf8/",
		"/line\r\nbreak\t/":                  "/linebreak/",
		"/c1\u0085control/":                  "/c1control/",
		"/naïve 日本 ok/":                      "/naïve 日本 ok/",
	}
	for in, want := range cases {
		if got := cleanUserAgent(in); got != want {
			t.Errorf("cleanUserAgent(%q) = %q, want %q", in, got, want)
		}
	}
}
