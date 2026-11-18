// Package network holds the per-network constants the crawler needs.
package network

import (
	"fmt"

	"github.com/gcash/bchd/chaincfg/chainhash"
	"github.com/gcash/bchd/wire"
)

// ChainCheck names two consecutive blocks that exist only on this chain. A
// peer asked for the headers after Block must answer with Next; a peer on a
// chain that shares the network magic (eCash, Bitcoin SV) does not know Block
// and answers from its genesis instead.
type ChainCheck struct {
	Block chainhash.Hash
	Next  chainhash.Hash
}

type Params struct {
	Name        string
	Magic       wire.BitcoinNet
	DefaultPort uint16
	// DNSSeeds mirrors Bitcoin Cash Node's chainparams (v29.1.0).
	DNSSeeds []string
	// ChainCheck is nil where no other chain shares the magic.
	ChainCheck *ChainCheck
}

func mustHash(s string) chainhash.Hash {
	h, err := chainhash.NewHashFromStr(s)
	if err != nil {
		panic(err)
	}
	return *h
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
	// The first two blocks after the November 2020 split from eCash (661,648
	// and 661,649); Bitcoin SV split off earlier, at 556,767.
	ChainCheck: &ChainCheck{
		Block: mustHash("0000000000000000029e471c41818d24b8b74c911071c4ef0b4a0509f9b5a8ce"),
		Next:  mustHash("000000000000000004cc2dd59571e2ab3d6d322f181acba6f9cf6d68787879c2"),
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
