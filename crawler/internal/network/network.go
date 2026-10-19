// Package network holds the per-network constants the crawler needs.
package network

import (
	"fmt"

	"github.com/gcash/bchd/wire"
)

type Params struct {
	Name        string
	Magic       wire.BitcoinNet
	DefaultPort uint16
	// DNSSeeds mirrors Bitcoin Cash Node's chainparams (v29.1.0).
	DNSSeeds []string
}

var Mainnet = Params{
	Name:        "mainnet",
	Magic:       wire.MainNet,
	DefaultPort: 8333,
	DNSSeeds: []string{
		"seed.flowee.cash",
		"seed-bch.bitcoinforks.org",
		"btccash-seeder.bitcoinunlimited.info",
		"seed.bchd.cash",
		"seed.bch.loping.net",
		"dnsseed.electroncash.de",
		"bchseed.c3-soft.com",
		"bch.bitjson.com",
	},
}

var Testnet4 = Params{
	Name:        "testnet4",
	Magic:       wire.TestNet4,
	DefaultPort: 28333,
	DNSSeeds: []string{
		"testnet4-seed-bch.toom.im",
		"seed.tbch4.loping.net",
		"testnet4-seed.flowee.cash",
		"testnet4.bitjson.com",
	},
}

var Chipnet = Params{
	Name:        "chipnet",
	Magic:       wire.ChipNet,
	DefaultPort: 48333,
	DNSSeeds: []string{
		"chipnet.bitjson.com",
		"seed.cbch.loping.net",
	},
}

var Regtest = Params{
	Name:        "regtest",
	Magic:       wire.TestNet, // bchd names the regtest magic "TestNet"
	DefaultPort: 18444,
}

func ByName(name string) (Params, error) {
	for _, p := range []Params{Mainnet, Testnet4, Chipnet, Regtest} {
		if p.Name == name {
			return p, nil
		}
	}
	return Params{}, fmt.Errorf("unknown network %q", name)
}
