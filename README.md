# My HomeLab 🛠️

### One Acer, one Legion, and a growing list of things to figure out.

This is my hands-on project for learning Docker, networking, storage, and self-hosting. I wanted to understand what happens behind the apps I use—and give hardware I already own a second job.

The Acer runs the services. The Legion is my main command centre, and my phone gives me remote access when I’m away. GitHub holds the setup, the notes, and the evidence that “it works” usually needs another test.

## Homelab dashboard

![Emil's Homelab dashboard](https://raw.githubusercontent.com/epaul23/epaul-homelab/main/docs/images/homelab-dashboard.png)

## The hardware

**Acer — the home server**

I reused my Acer instead of buying a Raspberry Pi. It was already available, and it lets me experiment with several services on one machine.

It now runs Ubuntu directly, with Docker Engine and Docker Compose hosting most services. I started with Windows and WSL, then migrated to native Ubuntu to make Acer a dedicated server.

**Legion — the command centre**

My everyday computer is also where I manage the lab. I open dashboards, connect to Acer through SSH, and maintain the configuration from here.

**G-RAID MIRROR — storage**

A SanDisk Professional G-RAID MIRROR is connected to Acer with **2× 2 TB Toshiba MG04ACA200N enterprise SATA HDDs**, running at 7200 RPM in RAID 1.

It is mounted at `/mnt/graid` on Acer. Samba shares it as `GRAID_MAIN`, so I can also open it as a network drive from Windows.

## Built on a budget

Most of the hardware was equipment I already owned.

For storage, I found the G-RAID enclosure for **$60 CAD** on FB Marketplace and bought two matching enterprise HDDs through an eBay auction for about **$92 CAD before shipping and tax**, with incredibly low hours on them.

The goal was to learn with hardware I already had instead of buying a ready-made NAS.

## What’s running on Acer

| Service          | What I use it for                                           |
| ---------------- | ----------------------------------------------------------- |
| AdGuard Home     | DNS filtering for my NETGEAR network                        |
| Uptime Kuma      | Service monitoring and Discord alerts                       |
| Immich           | Self-hosted photo and video library                         |
| Homarr           | Main homelab dashboard                                      |
| Glances          | CPU, memory, disk, and system monitoring                    |
| Homepage         | Another dashboard I experimented with                       |
| Docker Stats     | Gives Homarr limited access to Docker stats                 |
| G-RAID Dashboard | Custom storage, health, temperature, and history monitoring |
| Plex             | Self-hosted movie and TV media server                       |
| Jellyfin         | Self-hosted movie and TV media server (open-source)         |
| Nextcloud        | Self-hosted file access and sync                            |
| Karakeep         | Bookmarking and read-it-later service                       |
| Dozzle           | Docker container log viewer                                 |
| qBittorrent      | Downloads to the G-RAID                                     |
| Speedtest Tracker | Scheduled internet speed tests and history                 |

Most services run in Docker.

The G-RAID dashboard is different. It is a small Python service on Ubuntu, managed by systemd. It reads drive health through `smartctl` and serves a compact overview in Homarr.

Speedtest Tracker runs a speed test every four hours and shows the results in Homarr.

Tailscale gives me private remote access to Acer. SSH lets me manage it from the Legion without moving to the server.

## How it fits together
```text
 Remote access
     │
  Tailscale
     │
     ▼
Acer Server (Ubuntu)
├── Docker
│   ├── Dashboards & monitoring
│   │   ├── Homarr
│   │   ├── Homepage
│   │   ├── Uptime Kuma
│   │   ├── Glances
│   │   ├── Dozzle
│   │   ├── Docker Stats
│   │   └── Speedtest Tracker
│   │
│   ├── Data & media
│   │   ├── Immich
│   │   ├── Jellyfin
│   │   ├── Plex
│   │   ├── Nextcloud
│   │   ├── Karakeep
│   │   └── qBittorrent
│   │
│   └── Network
│       └── AdGuard Home
│
├── systemd
│   └── G-RAID Dashboard (Python)
│
└── /mnt/graid
    └── G-RAID RAID 1 (shared with Samba)
```

## Custom G-RAID monitoring

I built a small Python web server to monitor the G-RAID directly from Ubuntu.

It:

- Reads drive health, temperature, power-on hours, and storage usage.
- Samples the drive temperature every **5 minutes**.
- Stores temperature history in CSV and keeps a rolling **7 days** of data.
- Periodically scans folder sizes and caches the results instead of rescanning on every page load.
- Exposes simple API endpoints for status, storage, and temperature history.
- Runs in the background as a systemd service.

The dashboard reads SMART information with `smartctl` and disk usage from the mounted G-RAID. It stays separate from Docker because it needs direct access to the host's storage devices. Its overview is embedded in Homarr.

## My little corner of the network

The NETGEAR router sits behind the Rogers gateway and runs its own local network. Acer is connected to NETGEAR over Ethernet, with a reserved IP address.

NETGEAR sends DNS lookups to AdGuard on Acer. That keeps the filtering on my side of the setup without changing DNS for devices connected directly to Rogers.

AdGuard handles the address lookups—not the actual video streams and downloads. Devices using their own DNS or VPN can still bypass it.

## Things I learned the hard way

**A running container isn’t the whole story.**

After a reboot, AdGuard was running but showing its first-time setup screen. Its settings still existed in Ubuntu—the container just couldn’t see them through the folder mounts.

I backed up the data, moved it into Docker-managed volumes, and tested another restart. AdGuard recovered without needing to recreate the container.

**A monitor needs to survive what it’s monitoring.**

Kuma can report an AdGuard failure while Acer stays running. It can’t reliably tell me Acer is offline when Kuma goes offline with it.

**DNS is small until it stops working.**

Acer is currently NETGEAR’s DNS server. While it restarts, devices can stay connected to Wi-Fi but struggle to open websites.

**Not everything belongs in Docker.**

My G-RAID dashboard needs direct access to the host's storage devices, so I run it as a Python systemd service instead of a container.

### Debugging the G-RAID cooling

The drives initially sat around **54–56°C** while the enclosure fan stayed off.

After checking SMART temperatures, contacting WD support, and testing external airflow, I confirmed that the enclosure uses temperature-controlled fan behaviour.

Adding external airflow dropped the drive temperature from about **55°C to around 40°C**.

That also pushed me to add historical temperature monitoring instead of relying on occasional manual checks.

## Storage and backups

The G-RAID MIRROR currently runs two drives in RAID 1.

That gives me protection against one drive failing, but RAID is not a backup. I still want separate copies of important files as the storage setup grows.

Jellyfin and Plex read their movie and TV libraries from the G-RAID. Immich, Nextcloud, and qBittorrent also use folders on the array; their application and database data live separately on Acer or in Docker volumes.

## Next experiments

Still on my list:

- Improve the backup setup.
- Keep improving remote monitoring.
- Add useful services without turning the server into a pile of containers I do not actually need.
- Keep improving the G-RAID monitoring dashboard.
