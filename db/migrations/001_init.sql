-- bch-nodemap schema v1
--
-- A snapshot is one full crawl of the network. Every reachable node found in
-- that crawl gets one row in snapshot_nodes. Historical BU cashnodes data is
-- imported into the same tables with source = 'cashnodes'.

create table snapshots (
    id          bigserial primary key,
    taken_at    timestamptz not null,
    source      text        not null default 'crawler',  -- 'crawler' | 'cashnodes'
    network     text        not null default 'mainnet',  -- 'mainnet' | 'testnet4' | 'chipnet' | 'regtest'
    reachable   integer     not null,                    -- nodes that completed the handshake
    discovered  integer,                                 -- distinct addresses learned (null for imports)
    duration_ms integer,                                 -- crawl wall time (null for imports)
    unique (network, source, taken_at)
);

create index snapshots_network_taken_at on snapshots (network, taken_at desc);

create table snapshot_nodes (
    snapshot_id      bigint      not null references snapshots (id) on delete cascade,
    address          text        not null,  -- IP literal or .onion/.i2p host
    port             integer     not null,
    net              text        not null,  -- 'ipv4' | 'ipv6' | 'onion' | 'i2p' | 'cjdns'
    protocol_version integer,
    user_agent       text,
    services         bigint,
    height           integer,               -- start_height from the version message
    first_seen       timestamptz,           -- first time this endpoint was seen reachable
    latency_ms       integer,               -- TCP connect + handshake time
    hostname         text,                  -- reverse DNS
    country          text,                  -- ISO 3166-1 alpha-2
    city             text,
    lat              real,
    lon              real,
    timezone         text,
    asn              integer,
    org              text,                  -- AS organisation / hosting provider
    primary key (snapshot_id, address, port)
);

create index snapshot_nodes_user_agent on snapshot_nodes (user_agent);
create index snapshot_nodes_endpoint on snapshot_nodes (address, port);

-- One row per endpoint ever seen reachable; maintained by the crawler.
-- Also used to re-seed the next crawl so it does not depend only on DNS seeds.
create table nodes (
    network         text        not null,
    address         text        not null,
    port            integer     not null,
    net             text        not null,
    first_seen      timestamptz not null,
    last_seen       timestamptz not null,
    last_user_agent text,
    primary key (network, address, port)
);

create index nodes_last_seen on nodes (network, last_seen desc);
