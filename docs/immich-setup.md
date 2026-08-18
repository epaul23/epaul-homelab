# Immich Setup

This guide documents the deployment of **Immich** using Docker Compose within the homelab environment.

Official installation guide:

https://docs.immich.app/install/docker-compose/

---

## Architecture

```text
Phone / Browser
       │
       ▼
Immich Server :2283
       │
       ├── PostgreSQL
       ├── Valkey
       └── Immich Machine Learning
                │
                ▼
           Media Library
```

---

## 1. Create the Immich Service

```bash
cd ~/homelab/services
mkdir immich
cd immich
```

Download the official Immich Docker Compose configuration:

```bash
wget -O docker-compose.yml https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
```

Download the environment template:

```bash
wget -O .env https://github.com/immich-app/immich/releases/latest/download/example.env
```

Create a version safe to store in Git:

```bash
cp .env .env.example
```

The directory should now contain:

```text
services/
└── immich/
    ├── .env
    ├── .env.example
    └── docker-compose.yml
```

---

## 2. Configure the Environment

Edit:

```bash
nano .env
```

Important settings:

```env
UPLOAD_LOCATION=./library
DB_DATA_LOCATION=./postgres

TZ=<YOUR_TIMEZONE>

IMMICH_VERSION=v3

DB_PASSWORD=<PRIVATE_ALPHANUMERIC_PASSWORD>

DB_USERNAME=postgres
DB_DATABASE_NAME=immich
```

Generate a random alphanumeric database password if needed:

```bash
openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24
```

The real `.env` contains machine-specific configuration and secrets and should **never be committed to Git**.

---

## 3. Inspect the Stack

Before starting Immich:

```bash
docker compose config --services
```

The stack includes:

```text
database
immich-machine-learning
redis
immich-server
```

### Components

**Immich Server**  
Main web application and API.

**PostgreSQL**  
Stores application metadata, users, albums, settings, and other application state.

**Immich Machine Learning**  
Provides smart search, facial recognition, and related ML functionality.

**Valkey**  
Provides caching and coordination used internally by Immich.

---

## 4. Start Immich

```bash
docker compose up -d
```

Verify that the containers are running:

```bash
docker compose ps
```

Open the web interface:

```text
http://localhost:2283
```

The first account created becomes the administrator.

---

## 5. Storage

During development, Immich stores its data locally:

```text
services/immich/
├── library/
└── postgres/
```

### Media

Uploaded originals and generated assets are stored under:

```text
library/
```

Immich may create directories such as:

```text
library/library/
library/thumbs/
library/encoded-video/
```

### Database

PostgreSQL data is stored under:

```text
postgres/
```

Do not manually modify the PostgreSQL files.

---

## 6. Optional Storage Template

Immich can organize uploaded originals using a readable directory structure.

Example template:

```text
{{y}}/{{y}}-{{MM}}-{{dd}}/{{filename}}
```

This produces paths similar to:

```text
2026/
└── 2026-08-17/
    └── IMG_1234.jpg
```

The storage template controls the physical file structure and does not determine how photos are ordered in the Immich timeline.

Reference:

https://docs.immich.app/administration/storage-template/

---

## 7. Protect Persistent Data from Git

Add the following to the repository `.gitignore`:

```gitignore
.env
*.env
!.env.example

# Immich data
services/immich/library/
services/immich/postgres/
```

Git should track:

```text
services/immich/.env.example
services/immich/docker-compose.yml
```

Git should **not** track:

```text
services/immich/.env
services/immich/library/
services/immich/postgres/
```

Verify:

```bash
git status --short --untracked-files=all
```

Optional explicit check:

```bash
git check-ignore -v \
services/immich/.env \
services/immich/library \
services/immich/postgres
```

---

## 8. Commit the Immich Configuration

From the repository root:

```bash
cd ~/homelab
```

Stage and review:

```bash
git add .
git status
```

Commit:

```bash
git commit -m "Set up Immich Docker service"
```

Push:

```bash
git push
```

Only configuration should be pushed. Persistent media, database files, and secrets remain local.

---

## 9. Connect the Mobile App

Find the Windows host's local IP address:

```powershell
ipconfig
```

Use the IPv4 address from the active network adapter.

The mobile endpoint follows this format:

```text
http://<HOST_IP>:2283
```

Example:

```text
http://192.168.1.100:2283
```

The phone and host must be reachable over the same local network for this setup.

---

## 10. Useful Commands

Start Immich:

```bash
docker compose up -d
```

Stop Immich:

```bash
docker compose down
```

Check container status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs
```

Follow logs live:

```bash
docker compose logs -f
```

List Compose services:

```bash
docker compose config --services
```

---

## Repository Structure

```text
services/
└── immich/
    ├── .env
    ├── .env.example
    ├── docker-compose.yml
    ├── library/
    └── postgres/
```

### Tracked

```text
.env.example
docker-compose.yml
```

### Local Only

```text
.env
library/
postgres/
```

---

## Backup Requirement

A complete Immich backup requires both:

```text
Media library
+
PostgreSQL database
```

Disk mirroring or RAID alone is not a complete backup strategy.

Backup and restore documentation:

https://docs.immich.app/administration/backup-and-restore/

---

## Future Deployment

The development setup currently uses local WSL storage.

The production deployment will move persistent media storage to the homelab's external DAS while keeping the Docker configuration portable through Git.

Planned work:

- Migrate Immich to the dedicated host
- Move persistent media to external storage
- Configure database backups
- Configure media backups
- Implement a 3-2-1 backup strategy
- Add storage health monitoring
- Configure secure remote access
- Document upgrade and restore procedures

---

## References

Immich Docker Compose:

https://docs.immich.app/install/docker-compose/

Storage Template:

https://docs.immich.app/administration/storage-template/

Backup and Restore:

https://docs.immich.app/administration/backup-and-restore/
