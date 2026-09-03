# My HomeLab 🛠️

### One Acer, one Legion, and a growing list of things to figure out.

This is my hands-on project for learning Docker, networking, storage, and self-hosting. I wanted to understand what happens behind the apps I use—and give hardware I already own a second job.

The Acer runs the services. The Legion is my command centre. GitHub holds the setup, the notes, and the evidence that “it works” usually needs another test.

## The hardware

**Acer — the home server**

I reused my Acer instead of buying a Raspberry Pi. It was already available, and it lets me experiment with several services on one machine.

It runs Windows, Ubuntu through WSL, and Docker Desktop. Not the simplest possible server setup, but troubleshooting it has become part of the learning.

**Legion — the command centre**

My everyday computer is also where I manage the lab. I open dashboards, connect to Acer through SSH, and maintain the configuration from here.

**G-RAID MIRROR — storage**

A SanDisk Professional G-RAID MIRROR is connected to Acer and runs two HDDs in RAID 1.

It stores files for the homelab and is also shared across my network so I can access it from other devices.

## What’s running on Acer

| Service | What I use it for |
| --- | --- |
| AdGuard Home | DNS filtering for my NETGEAR network |
| Uptime Kuma | Service monitoring and Discord alerts |
| Immich | Self-hosted photo and video library |
| Homarr | Main homelab dashboard |
| Glances | CPU, memory, disk, and system monitoring |
| Homepage | Another dashboard I experimented with |
| Docker Stats | Gives Homarr limited access to Docker stats |
| G-RAID Dashboard | Custom storage, health, temperature, and history monitoring |

Most services run in Docker.

The G-RAID dashboard is different. It runs as a Windows PowerShell service because Windows has direct access to the G-RAID storage information. Windows Task Scheduler keeps it running in the background.

Tailscale gives me private remote access to Acer. SSH lets me manage it from the Legion without moving to the server.

## My little corner of the network

The NETGEAR router sits behind the Rogers gateway and runs its own local network. Acer is connected to NETGEAR over Ethernet, with a reserved IP address.

NETGEAR sends DNS lookups to AdGuard on Acer. That keeps the filtering on my side of the setup without changing DNS for devices connected directly to Rogers.

AdGuard handles the address lookups—not the actual video streams and downloads. Devices using their own DNS or VPN can still bypass it.

Tailscale gives me another private route into the homelab when I am away from home.

## Things I learned the hard way

**A running container isn’t the whole story.**

After a reboot, AdGuard was running but showing its first-time setup screen. Its settings still existed in Ubuntu—the container just couldn’t see them through the folder mounts.

I backed up the data, moved it into Docker-managed volumes, and tested another restart. AdGuard recovered without needing to recreate the container.

**A monitor needs to survive what it’s monitoring.**

Kuma can report an AdGuard failure while Acer stays running. It can’t reliably tell me Acer is offline when Kuma goes offline with it.

**DNS is small until it stops working.**

Acer is currently NETGEAR’s DNS server. While it restarts, devices can stay connected to Wi-Fi but struggle to open websites.

**Not everything belongs in Docker.**

My G-RAID dashboard needs Windows storage information that is easier to access directly from PowerShell.

Instead of forcing it into Docker, I let Windows Task Scheduler run it in the background and restart it if needed.

## Storage and backups

The G-RAID MIRROR currently runs two drives in RAID 1.

That gives me protection against one drive failing, but RAID is not a backup. I still want separate copies of important files as the storage setup grows.

The G-RAID is also shared from Acer as a network drive so other machines on my network can use the storage.

## Next experiments

Still on my list:

- Improve the backup setup.
- Keep improving remote monitoring.
- Add more useful services without turning the server into a pile of containers I do not actually need.
- Keep improving the G-RAID monitoring dashboard.
