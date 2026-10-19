// Package geo resolves IP addresses to location and hosting provider using
// .mmdb databases (DB-IP Lite by default, MaxMind GeoLite2 also works).
package geo

import (
	"net"

	"github.com/oschwald/geoip2-golang"
)

type Info struct {
	Country  string
	City     string
	Lat, Lon *float64
	Timezone string
	ASN      int
	Org      string
}

type DB struct {
	city *geoip2.Reader
	asn  *geoip2.Reader
}

// Open loads the databases; an empty path disables that lookup.
func Open(cityPath, asnPath string) (*DB, error) {
	db := &DB{}
	var err error
	if cityPath != "" {
		if db.city, err = geoip2.Open(cityPath); err != nil {
			return nil, err
		}
	}
	if asnPath != "" {
		if db.asn, err = geoip2.Open(asnPath); err != nil {
			return nil, err
		}
	}
	return db, nil
}

func (db *DB) Lookup(ip net.IP) Info {
	var info Info
	if db == nil || ip == nil {
		return info
	}
	if db.city != nil {
		if c, err := db.city.City(ip); err == nil {
			info.Country = c.Country.IsoCode
			info.City = c.City.Names["en"]
			info.Timezone = c.Location.TimeZone
			if c.Location.Latitude != 0 || c.Location.Longitude != 0 {
				lat, lon := c.Location.Latitude, c.Location.Longitude
				info.Lat, info.Lon = &lat, &lon
			}
		}
	}
	if db.asn != nil {
		if a, err := db.asn.ASN(ip); err == nil {
			info.ASN = int(a.AutonomousSystemNumber)
			info.Org = a.AutonomousSystemOrganization
		}
	}
	return info
}

func (db *DB) Close() {
	if db == nil {
		return
	}
	if db.city != nil {
		db.city.Close()
	}
	if db.asn != nil {
		db.asn.Close()
	}
}
