#!/usr/bin/env python3

import csv
import json
import os
import shutil
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

PORT = 8787
DEVICE = "/dev/disk/by-id/usb-SanDisk_G-RAID_MIRROR_AAAABBBB1063-0:0"
SMART_TYPE = "sat"
MOUNT = Path("/mnt/graid")
PUBLIC_DIR = Path(__file__).parent / "public"
DATA_DIR = Path(__file__).parent / "data"
HISTORY_FILE = DATA_DIR / "temperature-history.csv"
FOLDER_CACHE_FILE = DATA_DIR / "folder-sizes.json"
SAMPLE_INTERVAL = 5 * 60
FOLDER_SCAN_INTERVAL = 6 * 60 * 60
HISTORY_RETENTION = timedelta(days=7)
HISTORY_LOCK = threading.Lock()
IGNORED_FOLDERS = {"$RECYCLE.BIN", "System Volume Information"}

DATA_DIR.mkdir(exist_ok=True)


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat()


def run(cmd):
    return subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        check=False,
    )


def require_graid_mount():
    # An empty /mnt/graid directory is on the Acer SSD, not the G-RAID.
    # Opening it also triggers systemd's automount when the drive is ready.
    next(MOUNT.iterdir(), None)
    result = run(["findmnt", "-rn", "-T", str(MOUNT), "-o", "SOURCE"])
    expected_partition = Path(f"{DEVICE}-part2").resolve(strict=True)
    sources = (Path(line).resolve() for line in result.stdout.splitlines() if line.startswith("/dev/"))
    if result.returncode != 0 or expected_partition not in sources:
        raise RuntimeError("G-RAID is not mounted at /mnt/graid")


def read_history(cutoff):
    rows = []
    if not HISTORY_FILE.exists():
        return rows
    with HISTORY_FILE.open(newline="", encoding="utf-8-sig") as history:
        for row in csv.DictReader(history):
            try:
                timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                temperature = int(row["temperature"])
                if timestamp >= cutoff:
                    rows.append({"timestamp": timestamp.isoformat(), "temperature": temperature})
            except (KeyError, TypeError, ValueError):
                continue
    return rows


def save_temperature_sample():
    status = get_status()
    if not status["online"] or status["temperature"] is None:
        print(f"Temperature sample skipped: {status.get('error', 'no temperature')}", flush=True)
        return
    now = datetime.now(timezone.utc)
    with HISTORY_LOCK:
        rows = read_history(now - HISTORY_RETENTION)
        rows.append({"timestamp": now.isoformat(), "temperature": status["temperature"]})
        temporary = HISTORY_FILE.with_suffix(".csv.tmp")
        with temporary.open("w", newline="", encoding="utf-8") as history:
            writer = csv.DictWriter(history, fieldnames=["timestamp", "temperature"])
            writer.writeheader()
            writer.writerows(rows)
        temporary.replace(HISTORY_FILE)


def refresh_folder_sizes():
    require_graid_mount()
    folders = []
    for folder in MOUNT.iterdir():
        if folder.name in IGNORED_FOLDERS or folder.is_symlink() or not folder.is_dir():
            continue
        result = subprocess.run(
            ["du", "-sb", "--", str(folder)],
            text=True, capture_output=True, check=False, timeout=30 * 60,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Could not scan {folder.name}: {result.stderr.strip()}")
        folders.append({"name": folder.name, "bytes": int(result.stdout.split()[0])})
    folders.sort(key=lambda folder: folder["bytes"], reverse=True)
    temporary = FOLDER_CACHE_FILE.with_suffix(".json.tmp")
    temporary.write_text(json.dumps({"generatedAt": now_iso(), "folders": folders}), encoding="utf-8")
    temporary.replace(FOLDER_CACHE_FILE)


def run_periodically(action, interval):
    while True:
        wait_seconds = interval
        try:
            action()
        except Exception as error:
            print(f"{action.__name__} failed: {error}", flush=True)
            wait_seconds = min(interval, 10 * 60)
        threading.Event().wait(wait_seconds)


def get_smart_text():
    result = run([
        "sudo",
        "smartctl",
        "-a",
        "-d",
        SMART_TYPE,
        DEVICE,
    ])

    if result.returncode not in (0, 4):
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())

    return result.stdout


def get_status():
    try:
        text = get_smart_text()

        model = None
        health = "Unavailable"
        temperature = None
        power_on_hours = None

        for line in text.splitlines():
            if line.startswith("Device Model:"):
                model = line.split(":", 1)[1].strip()

            elif "SMART overall-health self-assessment test result:" in line:
                health = line.split(":", 1)[1].strip()

            elif "Power_On_Hours" in line:
                parts = line.split()
                power_on_hours = int(parts[-1])

            elif "Temperature_Celsius" in line:
                parts = line.split()
                temperature = int(parts[9])

        if temperature is None:
            temperature_state = "Unavailable"
            temperature_level = "unknown"
        elif temperature >= 60:
            temperature_state = "Check Fan"
            temperature_level = "danger"
        elif temperature >= 50:
            temperature_state = "Warm"
            temperature_level = "warm"
        else:
            temperature_state = "Normal"
            temperature_level = "normal"

        return {
            "online": True,
            "name": "G-RAID MAIN",
            "label": "GRAID_MAIN",
            "model": model or "Unknown",
            "raid": "RAID 1",
            "health": health,
            "operationalStatus": "OK",
            "temperature": temperature,
            "temperatureState": temperature_state,
            "temperatureLevel": temperature_level,
            "powerOnHours": power_on_hours,
            "checkedAt": now_iso(),
        }

    except Exception as e:
        return {
            "online": False,
            "name": "G-RAID MAIN",
            "label": "GRAID_MAIN",
            "model": "Unknown",
            "raid": "RAID 1",
            "health": "Unavailable",
            "operationalStatus": "Unavailable",
            "temperature": None,
            "temperatureState": "Unavailable",
            "temperatureLevel": "unknown",
            "powerOnHours": None,
            "checkedAt": now_iso(),
            "error": str(e),
        }


def get_storage():
    try:
        require_graid_mount()
        usage = shutil.disk_usage(MOUNT)

        used = usage.total - usage.free
        used_percent = round((used / usage.total) * 100, 1)

        if used_percent >= 95:
            space_level = "danger"
        elif used_percent >= 85:
            space_level = "warm"
        else:
            space_level = "normal"

        folders = []
        folder_updated_at = None

        if FOLDER_CACHE_FILE.exists():
            try:
                cache = json.loads(FOLDER_CACHE_FILE.read_text())
                folders = cache.get("folders", [])
                folder_updated_at = cache.get("generatedAt")
            except Exception:
                pass

        return {
            "online": True,
            "name": "G-RAID MAIN",
            "label": "GRAID_MAIN",
            "driveLetter": None,
            "mountPoint": str(MOUNT),
            "fileSystem": "NTFS",
            "health": "Healthy",
            "totalBytes": usage.total,
            "usedBytes": used,
            "freeBytes": usage.free,
            "usedPercent": used_percent,
            "spaceLevel": space_level,
            "folders": folders,
            "folderSizesUpdatedAt": folder_updated_at,
            "checkedAt": now_iso(),
        }

    except Exception as e:
        return {
            "online": False,
            "name": "G-RAID MAIN",
            "label": "GRAID_MAIN",
            "health": "Unavailable",
            "totalBytes": None,
            "usedBytes": None,
            "freeBytes": None,
            "usedPercent": None,
            "spaceLevel": "unknown",
            "checkedAt": now_iso(),
            "error": str(e),
        }


def get_history():
    with HISTORY_LOCK:
        samples = read_history(datetime.now(timezone.utc) - timedelta(hours=24))
    temperatures = [sample["temperature"] for sample in samples]
    return {
        "rangeHours": 24,
        "sampleIntervalMinutes": SAMPLE_INTERVAL // 60,
        "minimum": min(temperatures) if temperatures else None,
        "average": round(sum(temperatures) / len(temperatures), 1) if temperatures else None,
        "maximum": max(temperatures) if temperatures else None,
        "generatedAt": now_iso(),
        "samples": samples,
    }


class Handler(SimpleHTTPRequestHandler):
    def public_path(self, path):
        root = PUBLIC_DIR.resolve()
        relative = unquote(urlparse(path).path).lstrip("/") or "index.html"
        target = (root / relative).resolve()
        return target if target.is_relative_to(root) else None

    def translate_path(self, path):
        target = self.public_path(path)
        return str(target if target is not None else PUBLIC_DIR.resolve())

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/status":
            return self.send_json(get_status())

        if path == "/api/storage":
            return self.send_json(get_storage())

        if path == "/api/history":
            return self.send_json(get_history())

        if self.public_path(self.path) is None:
            return self.send_error(403, "Access denied")

        return super().do_GET()

    def do_HEAD(self):
        if self.public_path(self.path) is None:
            return self.send_error(403, "Access denied")
        return super().do_HEAD()


if __name__ == "__main__":
    print(f"G-RAID dashboard running on http://0.0.0.0:{PORT}")
    threading.Thread(target=run_periodically, args=(save_temperature_sample, SAMPLE_INTERVAL), daemon=True).start()
    threading.Thread(target=run_periodically, args=(refresh_folder_sizes, FOLDER_SCAN_INTERVAL), daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
