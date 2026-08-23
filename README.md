# HomeLab

Portable Docker Compose definitions for the home server.

## Services

- `services/immich` - photo and video management
- `services/uptime-kuma` - service monitoring
- `services/adguard-home` - network DNS filtering

## Safe repository layout

Only Compose files, documentation, examples, and empty directory placeholders belong in Git.
The repository intentionally excludes:

- real `.env` files and passwords
- Immich photos, database files, and backups
- Uptime Kuma's Docker-managed database volume
- AdGuard Home's generated configuration, credentials, query logs, and runtime data

Do not force-add ignored files. Back up application data separately from this repository.

## Start on a new host

Clone the repository, then create Immich's local environment file:

```bash
git clone https://github.com/epaul23/epaul-homelab.git ~/homelab
cd ~/homelab/services/immich
cp .env.example .env
```

Edit `.env` for the new host before starting Immich. Start services individually:

```bash
cd ~/homelab/services/uptime-kuma
docker compose up -d

cd ~/homelab/services/adguard-home
docker compose up -d

cd ~/homelab/services/immich
docker compose up -d
```

AdGuard Home creates its live files under `conf/` and `work/` on first start. Complete its setup
wizard on the new host. Uptime Kuma stores its live state in the `uptime-kuma-data` Docker volume.
These service databases are not transferred by cloning Git.

Before moving DNS clients or the router to the new AdGuard instance, confirm the new host has a
stable LAN address and that both TCP and UDP port 53 are available.
