#!/usr/bin/env python3
"""
Find My iCloud Monitor
Authenticates directly to Apple's iCloud Find My API (via pyicloud) and
polls real device locations -- the same data the Find My app shows.

This replaces local cache-file parsing entirely: Apple encrypts the on-disk
Find My cache, so this talks to Apple's API as the signed-in account owner
instead, which returns plaintext location data once authenticated.

Setup:
  pip3 install pyicloud

Usage:
  python3 findmy_icloud_monitor.py                  # monitor all devices
  python3 findmy_icloud_monitor.py "Jciphone212121" # monitor one device
  python3 findmy_icloud_monitor.py --export         # write findmy_live.json
  python3 findmy_icloud_monitor.py --forget         # clear saved Keychain password
"""

import os
import sys
import json
import time
import getpass
import hashlib
import datetime
import subprocess
from pathlib import Path

try:
    from pyicloud import PyiCloudService
except ImportError:
    print("pyicloud is required. Install it with:\n    pip3 install pyicloud")
    sys.exit(1)

try:
    import keyring
    HAVE_KEYRING = True
except ImportError:
    HAVE_KEYRING = False

# ── Config ────────────────────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = 60   # be polite to Apple's API -- don't poll faster than this
LOG_FILE              = os.path.expanduser("~/findmy_monitor_log.txt")
JSON_EXPORT_FILE      = os.path.join(os.path.dirname(os.path.abspath(__file__)), "findmy_live.json")
SESSION_DIR           = os.path.expanduser("~/.pyicloud_session")
KEYRING_SERVICE       = "findmy_icloud_monitor"


def log(msg: str):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def notify(title: str, body: str):
    script = f'display notification "{body}" with title "{title}" sound name "Ping"'
    try:
        subprocess.run(["osascript", "-e", script], check=False)
    except Exception:
        pass


def coords_to_maps_link(lat: float, lon: float) -> str:
    return f"https://maps.apple.com/?q={lat},{lon}&ll={lat},{lon}&z=16"


# ── Auth ──────────────────────────────────────────────────────────────────────

def get_password(apple_id: str) -> str:
    if HAVE_KEYRING:
        saved = keyring.get_password(KEYRING_SERVICE, apple_id)
        if saved:
            return saved
    pw = getpass.getpass(f"Apple ID password for {apple_id}: ")
    if HAVE_KEYRING:
        choice = input("Save password in macOS Keychain so you don't retype it? [y/N]: ").strip().lower()
        if choice == "y":
            keyring.set_password(KEYRING_SERVICE, apple_id, pw)
            print("Saved to Keychain. Run with --forget to remove it later.")
    return pw


def login() -> "PyiCloudService":
    apple_id = os.environ.get("ICLOUD_APPLE_ID") or input("Apple ID email: ").strip()
    password = get_password(apple_id)

    Path(SESSION_DIR).mkdir(parents=True, exist_ok=True)
    api = PyiCloudService(apple_id, password, cookie_directory=SESSION_DIR)

    if api.requires_2fa:
        code = input("Enter the 2FA code sent to your trusted device: ").strip()
        if not api.validate_2fa_code(code):
            print("Failed to verify 2FA code.")
            sys.exit(1)
        if not api.is_trusted_session:
            api.trust_session()
    elif api.requires_2sa:
        devices = api.trusted_devices
        for i, d in enumerate(devices):
            print(f"  {i}: {d.get('deviceName')}")
        idx = int(input("Send verification code to device #: ").strip())
        device = devices[idx]
        if not api.send_verification_code(device):
            print("Failed to send verification code.")
            sys.exit(1)
        code = input("Enter the code you received: ").strip()
        if not api.validate_verification_code(device, code):
            print("Failed to validate verification code.")
            sys.exit(1)

    return api


def forget_password():
    if not HAVE_KEYRING:
        print("keyring module not installed -- nothing to forget.")
        return
    apple_id = os.environ.get("ICLOUD_APPLE_ID") or input("Apple ID email to forget: ").strip()
    try:
        keyring.delete_password(KEYRING_SERVICE, apple_id)
        print(f"Removed saved password for {apple_id}.")
    except keyring.errors.PasswordDeleteError:
        print("No saved password found for that Apple ID.")


# ── Device data ───────────────────────────────────────────────────────────────

def extract_device(d) -> dict | None:
    data = d.data
    loc = data.get("location")
    if not loc or loc.get("latitude") is None:
        return None

    ts = None
    if loc.get("timeStamp"):
        ts = datetime.datetime.fromtimestamp(loc["timeStamp"] / 1000)

    battery = data.get("batteryLevel")

    return {
        "name":      data.get("name") or "Unknown Device",
        "model":     data.get("deviceDisplayName") or "",
        "lat":       loc["latitude"],
        "lon":       loc["longitude"],
        "accuracy":  loc.get("horizontalAccuracy"),
        "timestamp": ts.isoformat() if ts else None,
        "battery":   round(battery * 100) if battery is not None else None,
        "maps_link": coords_to_maps_link(loc["latitude"], loc["longitude"]),
        "lost_mode": data.get("deviceStatus") == "201",
    }


def export_json(devices: list[dict]):
    payload = {
        "updated": datetime.datetime.now().isoformat(),
        "devices": devices,
    }
    with open(JSON_EXPORT_FILE, "w") as f:
        json.dump(payload, f, indent=2)


# ── Monitor loop ──────────────────────────────────────────────────────────────

def monitor(api, target_name: str | None, export: bool):
    print("=" * 62)
    print("  Find My iCloud Monitor")
    print(f"  Target  : {'ALL devices' if target_name is None else target_name}")
    print(f"  Poll    : every {POLL_INTERVAL_SECONDS}s")
    print(f"  Log     : {LOG_FILE}")
    if export:
        print(f"  Export  : {JSON_EXPORT_FILE}  (open findmy_dashboard.html)")
    print("=" * 62)
    print("Press Ctrl+C to stop.\n")

    prev_locs: dict[str, str] = {}
    check = 0

    while True:
        check += 1
        try:
            devices = api.devices
        except Exception as e:
            log(f"Error fetching devices from iCloud: {e}")
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        found = []
        for d in devices:
            info = extract_device(d)
            if not info:
                continue
            if target_name and info["name"].lower() != target_name.lower():
                continue
            found.append(info)

        if not found:
            label = target_name or "any device"
            log(f"Check #{check}: no location data returned for {label}.")
        else:
            for info in found:
                coord_hash = hashlib.md5(f"{info['lat']:.5f}{info['lon']:.5f}".encode()).hexdigest()
                if prev_locs.get(info["name"]) != coord_hash:
                    state = "MOVED" if info["name"] in prev_locs else "LOCATED"
                    log(f"*** {state} *** {info['name']}  [{info['model']}]")
                    log(f"    Coords : {info['lat']:.6f}, {info['lon']:.6f}")
                    log(f"    Maps   : {info['maps_link']}")
                    if info["lost_mode"]:
                        log("    ** LOST MODE ACTIVE **")
                    notify(
                        f"Find My: {info['name']}",
                        f"{state} — {info['lat']:.5f}, {info['lon']:.5f}"
                    )
                    prev_locs[info["name"]] = coord_hash
                else:
                    log(f"Check #{check} [{info['name']}]: no change — {info['lat']:.6f}, {info['lon']:.6f}")

        if export:
            export_json(found)

        time.sleep(POLL_INTERVAL_SECONDS)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--forget" in sys.argv:
        forget_password()
        sys.exit(0)

    do_export = "--export" in sys.argv
    args       = [a for a in sys.argv[1:] if a != "--export"]
    target     = args[0] if args else None

    api = login()
    print("\nLogged in successfully.\n")
    try:
        monitor(api, target, do_export)
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
