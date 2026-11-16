#!/usr/bin/env bash

set -u

ROOT="$HOME/homelab/services"
LOG_DIR="$HOME/.local/state/homelab-update"
LOG="$LOG_DIR/latest.log"
FAILED=0

mkdir -p "$LOG_DIR"
echo "Maintenance started: $(date)" > "$LOG"

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is not running."
    exit 1
fi

has_compose_file() {
    [[ -f "$1/compose.yml" ||
       -f "$1/compose.yaml" ||
       -f "$1/docker-compose.yml" ||
       -f "$1/docker-compose.yaml" ]]
}

get_image_ids() {
    local directory="$1"
    local containers

    containers="$(
        cd "$directory" &&
        docker compose ps -q 2>/dev/null
    )" || true

    [[ -z "$containers" ]] && return 0

    while IFS= read -r container; do
        docker inspect --format '{{.Image}}' "$container"
    done <<< "$containers" | sort
}

echo "HomeLab maintenance"
echo

for dir in "$ROOT"/*/; do
    has_compose_file "$dir" || continue

    name="$(basename "$dir")"
    before="$(get_image_ids "$dir")"

    printf "%-34s " "Checking $name..."

    if (
        cd "$dir" &&
        docker compose config --quiet &&
        docker compose pull &&
        docker compose build --pull &&
        docker compose up \
            -d \
            --remove-orphans \
            --wait \
            --wait-timeout 180
    ) >> "$LOG" 2>&1; then

        after="$(get_image_ids "$dir")"

        if [[ -z "$before" && -n "$after" ]]; then
            echo "STARTED"
        elif [[ "$before" != "$after" ]]; then
            echo "UPDATED"
        else
            echo "CURRENT"
        fi
    else
        echo "FAILED"
        FAILED=1
    fi
done

printf "%-34s " "Checking graid-dashboard..."

if systemctl is-active --quiet graid-dashboard; then
    echo "RUNNING"
else
    echo "FAILED"
    FAILED=1
fi

if (( FAILED != 0 )); then
    echo
    echo "Maintenance finished with errors."
    echo "Details: $LOG"
    exit 1
fi

printf "%-34s " "Cleaning unused images..."

prune_output="$(docker image prune -f 2>&1)"
prune_status=$?
printf '%s\n' "$prune_output" >> "$LOG"

if (( prune_status != 0 )); then
    echo "FAILED"
    echo "Details: $LOG"
    exit 1
fi

reclaimed="$(
    printf '%s\n' "$prune_output" |
    awk -F': ' '/Total reclaimed space:/ {print $2}'
)"

if [[ -z "$reclaimed" || "$reclaimed" == "0B" ]]; then
    echo "NOT NEEDED"
else
    echo "CLEANED ($reclaimed)"
fi

echo
echo "Everything is updated and running."
echo "Details: $LOG"
