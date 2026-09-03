#!/usr/bin/env bash

SERVER_PATH="/home/epaul-server/homelab/services/graid-dashboard/server.ps1"
WINDOWS_PATH="$(wslpath -w "$SERVER_PATH")"

exec /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$WINDOWS_PATH"
