#!/usr/bin/env python3
"""Download a sample of the historical Bitcoin Unlimited cashnodes snapshots.

The cashnodes crawler ran from 2020-11-28 until 2024-04-03, taking a snapshot
roughly every 4 minutes (357k in total). The API only lists snapshots 10 per
page (newest first) and serves them by exact timestamp, so we walk the pages
with a stride: ~1 snapshot per day normally, ~1 per 80 minutes around the
network upgrades.

Output: archive/data/raw/<timestamp>.json.gz (resumable, existing files are skipped)

Usage: python3 archive/fetch_cashnodes.py [--stride 36] [--upgrade-stride 2]
"""
import argparse
import gzip
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

API = "https://cashnodes-api.bitcoinunlimited.info"
PER_DAY_PAGES = 36  # 360 snapshots/day at 4-minute intervals, 10 per page

# BCH network upgrades within the archive range; sample densely from 14 days
# before until 3 days after activation to capture adoption curves.
UPGRADES = [
    datetime(2021, 5, 15, 12, tzinfo=timezone.utc),
    datetime(2022, 5, 15, 12, tzinfo=timezone.utc),
    datetime(2023, 5, 15, 12, tzinfo=timezone.utc),
]
WINDOW_BEFORE = 14 * 86400
WINDOW_AFTER = 3 * 86400

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw")


def get(url, retries=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "bch-nodemap-archiver/0.1"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            wait = 2 ** attempt
            print(f"  ! {url}: {e} (retry in {wait}s)", file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f"giving up on {url}")


def in_upgrade_window(ts):
    return any(u.timestamp() - WINDOW_BEFORE <= ts <= u.timestamp() + WINDOW_AFTER for u in UPGRADES)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stride", type=int, default=PER_DAY_PAGES)
    ap.add_argument("--upgrade-stride", type=int, default=2)
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    first = json.loads(get(f"{API}/snapshots?page=1"))
    total_pages = first["meta"]["total_pages"]
    print(f"{first['meta']['total']} snapshots on {total_pages} pages", flush=True)

    page, fetched, skipped = 1, 0, 0
    while page <= total_pages:
        listing = first if page == 1 else json.loads(get(f"{API}/snapshots?page={page}"))
        snaps = listing["snapshots"]
        if not snaps:
            break
        ts = snaps[0]
        path = os.path.join(OUT_DIR, f"{ts}.json.gz")
        if os.path.exists(path):
            skipped += 1
        else:
            body = get(f"{API}/snapshots/{ts}")
            json.loads(body)  # validate before writing
            with gzip.open(path + ".tmp", "wb") as f:
                f.write(body)
            os.replace(path + ".tmp", path)
            fetched += 1
        when = datetime.fromtimestamp(int(ts), timezone.utc).strftime("%Y-%m-%d %H:%M")
        dense = in_upgrade_window(int(ts))
        print(f"page {page}/{total_pages} {ts} {when}{' [upgrade]' if dense else ''}", flush=True)
        page += args.upgrade_stride if dense else args.stride
        time.sleep(args.delay)

    print(f"done: {fetched} downloaded, {skipped} already present", flush=True)


if __name__ == "__main__":
    main()
