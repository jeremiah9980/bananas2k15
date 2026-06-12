#!/usr/bin/env python3
"""
Find My Device Monitor
Monitors Apple's local Find My cache on macOS.

Usage:
  python3 findmy_monitor.py                  # monitor ALL devices
  python3 findmy_monitor.py Jciphone212121   # monitor one specific device
  python3 findmy_monitor.py --export         # write live JSON for the dashboard
  python3 findmy_monitor.py --debug          # show every candidate file found
"""

import os
import sys
import json
import time
import plistlib
import hashlib
import datetime
import subprocess
import sqlite3
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = 20
LOG_FILE              = os.path.expanduser("~/findmy_monitor_log.txt")
JSON_EXPORT_FILE      = os.path.join(os.path.dirname(__file__), "findmy_live.json")

HOME = Path.home()

# macOS Find My data paths — covers legacy cache, sandboxed container, and
# the fmfd daemon used on macOS 12+ (Monterey and later).
FINDMY_DATA_FILES = [
    # Legacy (macOS 11 and earlier)
    "~/Library/Caches/com.apple.findmy.fmipcore/Devices.data",
    "~/Library/Caches/com.apple.findmy.fmipcore/Items.data",
    # Sandboxed app container (macOS 12+)
    "~/Library/Containers/com.apple.findmy/Data/Library/Caches/com.apple.findmy.fmipcore/Devices.data",
    "~/Library/Containers/com.apple.findmy/Data/Library/Caches/com.apple.findmy.fmipcore/Items.data",
    # fmfd daemon container
    "~/Library/Containers/com.apple.icloud.fmfd/Data/Library/Caches/com.apple.icloud.fmfd/Devices.data",
]
FINDMY_CACHE_DIRS = [
    # Legacy
    "~/Library/Caches/com.apple.findmy.fmipcore",
    "~/Library/Caches/com.apple.icloud.fmfd",
    "~/Library/Application Support/FindMy",
    # Sandboxed containers (macOS 12+)
    "~/Library/Containers/com.apple.findmy/Data/Library/Caches",
    "~/Library/Containers/com.apple.findmy/Data/Library/Application Support",
    "~/Library/Containers/com.apple.icloud.fmfd/Data/Library/Caches",
    "~/Library/Containers/com.apple.icloud.fmfd/Data/Library/Application Support",
    # CloudKit local store
    "~/Library/CloudKit",
]


# ── Logging ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts   = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


# ── macOS helpers ─────────────────────────────────────────────────────────────

def notify(title: str, body: str):
    script = f'display notification "{body}" with title "{title}" sound name "Ping"'
    try:
        subprocess.run(["osascript", "-e", script], check=False)
    except Exception:
        pass


def coords_to_maps_link(lat: float, lon: float) -> str:
    return f"https://maps.apple.com/?q={lat},{lon}&ll={lat},{lon}&z=16"


def haversine_meters(lat1, lon1, lat2, lon2) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6_371_000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi, dlam = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlam/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))


# ── Data readers ──────────────────────────────────────────────────────────────

def read_file(path: str):
    p = Path(path).expanduser()
    if not p.exists():
        return None
    try:
        with open(p, "rb") as f:
            return plistlib.load(f)
    except Exception:
        pass
    try:
        with open(p, "r") as f:
            return json.load(f)
    except Exception:
        return None


def flatten_to_device_list(data) -> list[dict]:
    """Return every dict that looks like a device/item record."""
    if isinstance(data, list):
        return [d for d in data if isinstance(d, dict)]
    if isinstance(data, dict):
        for key in ("devices", "Devices", "content", "Content", "items", "Items"):
            if isinstance(data.get(key), list):
                return [d for d in data[key] if isinstance(d, dict)]
        return [data]
    return []


def extract_location(device: dict) -> dict | None:
    loc = device.get("location") or device.get("Location") or {}
    if not loc and "latitude" in device:
        loc = device

    lat = loc.get("latitude") or loc.get("Latitude")
    lon = loc.get("longitude") or loc.get("Longitude")
    if lat is None or lon is None:
        return None

    ts_raw = (
        loc.get("timeStamp") or loc.get("TimeStamp") or
        loc.get("timestamp") or loc.get("locationTimestamp") or
        device.get("locationTimestamp")
    )
    ts = None
    if ts_raw:
        val = float(ts_raw)
        # CoreData reference date is 2001-01-01; Unix epoch offset = 978307200
        if val < 1_000_000_000:
            val += 978_307_200
        ts = datetime.datetime.fromtimestamp(val)

    name = (
        device.get("name") or device.get("Name") or
        device.get("deviceDisplayName") or device.get("DeviceDisplayName") or
        "Unknown Device"
    )
    model = device.get("deviceModel") or device.get("DeviceModel") or ""
    battery = device.get("batteryLevel") or device.get("BatteryLevel")

    return {
        "name":      name,
        "model":     model,
        "lat":       float(lat),
        "lon":       float(lon),
        "accuracy":  loc.get("horizontalAccuracy") or loc.get("HorizontalAccuracy"),
        "timestamp": ts.isoformat() if ts else None,
        "ts_obj":    ts,
        "battery":   round(float(battery) * 100) if battery else None,
        "maps_link": coords_to_maps_link(float(lat), float(lon)),
        "lost_mode": bool(device.get("lostModeState") or device.get("isLostModeEnabled")),
    }


def read_sqlite_devices(db_path: Path) -> list[dict]:
    """Try to pull device rows from a Core Data SQLite store."""
    results = []
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=3)
        cur = con.cursor()
        # Discover tables that might hold device/location data
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        for tbl in tables:
            if not any(k in tbl.upper() for k in ("DEVICE", "ITEM", "LOCATION", "OBJECT")):
                continue
            try:
                cur.execute(f"SELECT * FROM {tbl} LIMIT 200")
                cols = [c[0].lower() for c in cur.description]
                for row in cur.fetchall():
                    d = dict(zip(cols, row))
                    # Try to decode blob columns that may be plist/json
                    for k, v in list(d.items()):
                        if isinstance(v, bytes):
                            parsed = None
                            try:
                                parsed = plistlib.loads(v)
                            except Exception:
                                pass
                            if parsed is None:
                                try:
                                    parsed = json.loads(v)
                                except Exception:
                                    pass
                            if parsed:
                                d[k] = parsed
                    results.append(d)
            except Exception:
                continue
        con.close()
    except Exception:
        pass
    return results


def spotlight_findmy_files() -> list[Path]:
    """Use mdfind (Spotlight) to locate Find My related files."""
    candidates = []
    queries = [
        'kMDItemFSName == "Devices.data"',
        'kMDItemFSName == "*.findmy"',
        'kMDItemFSName contains "fmipcore"',
    ]
    for q in queries:
        try:
            out = subprocess.check_output(
                ["mdfind", q], timeout=5, stderr=subprocess.DEVNULL
            ).decode().strip()
            for line in out.splitlines():
                p = Path(line.strip())
                if p.is_file() and p.stat().st_size > 0:
                    candidates.append(p)
        except Exception:
            pass
    return candidates


def scan_all_devices(debug: bool = False) -> list[dict]:
    """Read every device from all Find My cache locations."""
    seen_names: dict[str, dict] = {}

    def ingest_data(data, source: str = ""):
        devs = flatten_to_device_list(data)
        for d in devs:
            loc = extract_location(d)
            if loc:
                if debug:
                    print(f"  [debug] found device '{loc['name']}' in {source}")
                seen_names[loc["name"]] = loc

    def try_file(p: Path):
        if debug:
            print(f"  [debug] trying {p}")
        data = read_file(str(p))
        if data:
            ingest_data(data, str(p))
            return
        # Try as SQLite
        rows = read_sqlite_devices(p)
        if rows:
            for r in rows:
                ingest_data(r, f"{p} (sqlite)")

    # 1) Explicit known files
    for path in FINDMY_DATA_FILES:
        p = Path(path).expanduser()
        if p.exists() and p.stat().st_size > 0:
            try_file(p)

    # 2) Walk all cache dirs (plist / json / data / sqlite)
    VALID_SUFFIXES = {".plist", ".json", ".data", ".db", ".sqlite", ".sqlite3", ""}
    for cache_dir in FINDMY_CACHE_DIRS:
        base = Path(cache_dir).expanduser()
        if not base.exists():
            continue
        for candidate in base.rglob("*"):
            if not candidate.is_file() or candidate.stat().st_size == 0:
                continue
            if candidate.suffix.lower() not in VALID_SUFFIXES:
                continue
            try_file(candidate)

    # 3) Spotlight fallback — useful if Apple moves the cache in a future macOS
    if not seen_names:
        for p in spotlight_findmy_files():
            try_file(p)

    return list(seen_names.values())


# ── Dashboard JSON export ─────────────────────────────────────────────────────

def export_json(devices: list[dict]):
    export = {
        "updated":  datetime.datetime.now().isoformat(),
        "devices":  [
            {k: v for k, v in d.items() if k != "ts_obj"}
            for d in devices
        ],
    }
    with open(JSON_EXPORT_FILE, "w") as f:
        json.dump(export, f, indent=2)


# ── Monitor loop ──────────────────────────────────────────────────────────────

def debug_scan():
    """Print every candidate file the script finds, then exit."""
    print("=" * 62)
    print("  Find My Monitor — DEBUG SCAN")
    print("=" * 62)
    print("\nSearching known paths and Spotlight for Find My data...\n")
    devices = scan_all_devices(debug=True)
    print(f"\nResult: {len(devices)} device(s) with location data found.")
    for d in devices:
        print(f"  • {d['name']} — {d['lat']:.6f}, {d['lon']:.6f}")
    if not devices:
        print("\nTip: Make sure Find My is open and has loaded devices at least once.")
        print("     You may also need to grant Full Disk Access to Terminal in")
        print("     System Settings → Privacy & Security → Full Disk Access.")


def monitor(target_name: str | None, export: bool):
    print("=" * 62)
    print("  Find My Device Monitor")
    print(f"  Target  : {'ALL devices' if target_name is None else target_name}")
    print(f"  Poll    : every {POLL_INTERVAL_SECONDS}s")
    print(f"  Log     : {LOG_FILE}")
    if export:
        print(f"  Export  : {JSON_EXPORT_FILE}  (open findmy_dashboard.html)")
    print("=" * 62)
    if sys.platform != "darwin":
        print("WARNING: macOS required — run this on the Mac signed into Find My.\n")
    print("Press Ctrl+C to stop.\n")

    prev_locs: dict[str, str] = {}   # name → coordinate hash
    check = 0

    while True:
        check += 1
        all_devices = scan_all_devices()

        if target_name:
            tl = target_name.lower()
            all_devices = [d for d in all_devices if d["name"].lower() == tl]

        if not all_devices:
            label = target_name or "any device"
            log(f"Check #{check}: No Find My data found for {label}.")
        else:
            for d in all_devices:
                coord_hash = hashlib.md5(f"{d['lat']:.5f}{d['lon']:.5f}".encode()).hexdigest()
                ts_str     = d["timestamp"] or "unknown time"
                bat_str    = f"  Battery:{d['battery']}%" if d["battery"] is not None else ""
                acc_str    = f"  ±{d['accuracy']:.0f}m" if d.get("accuracy") else ""

                if coord_hash != prev_locs.get(d["name"]):
                    if d["name"] in prev_locs:
                        log(f"*** MOVED *** {d['name']}")
                    else:
                        log(f"LOCATED: {d['name']}  [{d['model']}]")

                    log(f"    Coords : {d['lat']:.6f}, {d['lon']:.6f}{acc_str}{bat_str}")
                    log(f"    Time   : {ts_str}")
                    log(f"    Maps   : {d['maps_link']}")
                    if d["lost_mode"]:
                        log(f"    ** LOST MODE ACTIVE **")

                    notify(
                        f"Find My: {d['name']}",
                        f"{'MOVED — ' if d['name'] in prev_locs else ''}{d['lat']:.5f}, {d['lon']:.5f}"
                    )
                    prev_locs[d["name"]] = coord_hash
                else:
                    log(f"Check #{check} [{d['name']}]: no change — {d['lat']:.6f}, {d['lon']:.6f}")

        if export:
            export_json(all_devices if all_devices else [])

        time.sleep(POLL_INTERVAL_SECONDS)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    flags      = {"--export", "--debug"}
    do_export  = "--export" in sys.argv
    do_debug   = "--debug"  in sys.argv
    args       = [a for a in sys.argv[1:] if a not in flags]
    target     = args[0] if args else None
    try:
        if do_debug:
            debug_scan()
        else:
            monitor(target, do_export)
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
