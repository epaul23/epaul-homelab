#!/usr/bin/env python3

import csv
import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = 8787
DEVICE = "/dev/disk/by-id/usb-SanDisk_G-RAID_MIRROR_AAAABBBB1063-0:0"
SMART_TYPE = "sat"
MOUNT = Path("/mnt/graid")
PUBLIC_DIR = Path(__file__).parent / "public"
DATA_DIR = Path(__file__).parent / "data"
HISTORY_FILE = DATA_DIR / "temperature-history.csv"
FOLDER_CACHE_FILE = DATA_DIR / "folder-sizes.json"

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
    rows = []

    if not HISTORY_FILE.exists():
        return rows

    with HISTORY_FILE.open(newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            try:
                rows.append({
                    "timestamp": row["timestamp"],
                    "temperature": int(row["temperature"]),
                })
            except Exception:
                pass

    return rows


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urlparse(path).path
        relative = path.lstrip("/") or "index.html"
        return str(PUBLIC_DIR / relative)

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

        return super().do_GET()


if __name__ == "__main__":
    print(f"G-RAID dashboard running on http://0.0.0.0:{PORT}")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
