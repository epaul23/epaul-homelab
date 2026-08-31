# My HomeLab 🛠️
### One Acer, one Legion, and a growing list of things to figure out.

This is my hands-on project for learning Docker, networking, and self-hosting. I wanted to understand what happens behind the apps I use—and give hardware I already own a second job.

The Acer runs the services. The Legion is my command centre. GitHub holds the setup, the notes, and the evidence that “it works” usually needs another test.

## The hardware

**Acer — the home server**

I reused my Acer instead of buying a Raspberry Pi. It was already available, and it lets me experiment with several services on one machine.

It runs Windows, Ubuntu through WSL, and Docker Desktop. Not the simplest possible server setup, but troubleshooting it has become part of the learning.

**Legion — the command centre**

My everyday computer is also where I manage the lab. I open dashboards, connect to Acer through SSH, and maintain the configuration here.

## What’s running on Acer

| Service | What I use it for |
|---|---|
| AdGuard Home | DNS filtering for my NETGEAR network |
| Uptime Kuma | Service monitoring and Discord alerts |
| Immich | My self-hosted photo and video library |

Tailscale gives me private remote access to Acer. SSH lets me run commands on it without moving from the Legion.

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

Acer is currently NETGEAR’s only configured DNS server. While it restarts, devices can stay connected to Wi-Fi but struggle to open websites.

## Storage and next experiments

My planned storage setup includes a SanDisk Professional G-RAID MIRROR for photos and videos.

Mirroring can help with a drive failure, but it doesn’t replace a separate backup.

Still on my list:

- Set up and test permanent storage and backups.
- Remove the need to sign into Windows after a restart.
- Monitor Acer from somewhere other than Acer itself.

For now, Docker starts after Windows sign-in. In testing, AdGuard took up to roughly five minutes to return.

## About this repo

These are my Compose files and notes, not a polished one-click installer. I’m keeping the setup understandable while I learn.

Passwords, photos, databases, and backups stay out of GitHub. Cloning this repo does **not** restore my app data.

AdGuard expects two external Docker volumes. On a fresh machine, create them before starting it:

```bash
docker volume create adguard_work
docker volume create adguard_conf
```

Those volumes start empty. Restoring an existing setup means restoring its data separately.

---

Built to learn, tested by restarting, occasionally debugged from the other laptop.
