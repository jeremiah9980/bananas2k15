#!/usr/bin/env python3
"""
Find My Device Monitor
Monitors Apple's local Find My cache on macOS.

Usage:
  python3 findmy_monitor.py                  # monitor ALL devices
  python3 findmy_monitor.py Jciphone212121   # monitor one specific device
  python3 findmy_monitor.py --export         # write live JSON for the dashboard
"""

import os
import sys
import json
import time
import plistlib
import hashlib
import datetime
import subprocess
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = 20
LOG_FILE              = os.path.expanduser("~/findmy_monitor_log.txt")
JSON_EXPORT_FILE      = os.path.join(os.path.dirname(__file__), "findmy_live.json")

# macOS Find My data paths (searched in order)
FINDMY_DATA_FILES = [
    "~/Library/Caches/com.apple.findmy.fmipcore/Devices.data",
    "~/Library/Caches/com.apple.findmy.fmipcore/Items.data",
]
FINDMY_CACHE_DIRS = [
    "~/Library/Caches/com.apple.findmy.fmipcore",
    "~/Library/Caches/com.apple.icloud.fmfd",
    "~/Library/Application Support/FindMy",
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


def scan_all_devices() -> list[dict]:
    """Read every device from all Find My cache locations."""
    seen_names: dict[str, dict] = {}

    def ingest(data):
        for d in flatten_to_device_list(data):
            loc = extract_location(d)
            if loc:
                seen_names[loc["name"]] = loc

    for path in FINDMY_DATA_FILES:
        data = read_file(path)
        if data:
            ingest(data)

    for cache_dir in FINDMY_CACHE_DIRS:
        base = Path(cache_dir).expanduser()
        if not base.exists():
            continue
        for candidate in base.rglob("*"):
            if not candidate.is_file() or candidate.stat().st_size == 0:
                continue
            if candidate.suffix.lower() not in (".plist", ".json", ".data", ""):
                continue
            data = read_file(str(candidate))
            if data:
                ingest(data)

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
    args         = [a for a in sys.argv[1:] if a != "--export"]
    do_export    = "--export" in sys.argv
    target       = args[0] if args else None
    try:
        monitor(target, do_export)
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
