# Host Setup

This guide documents the base environment for my personal homelab using **Windows 11, WSL2, Ubuntu, Docker Desktop, Docker Compose, Git, and GitHub**.

The current machine is a development/test host. The stack will later be migrated to a dedicated Windows laptop connected to external DAS storage.

---

## Architecture

```text
Windows 11
│
├── Docker Desktop
│   └── WSL2 backend
│
└── Ubuntu (WSL2)
    │
    ├── Git
    ├── GitHub CLI
    └── Docker Compose
        │
        └── Self-hosted services
```

---

## 1. Create the Homelab Repository

Inside Ubuntu WSL:

```bash
cd ~
mkdir homelab
cd homelab

mkdir services

git init
git branch -m main

touch README.md
touch .gitignore
```

Initial structure:

```text
homelab/
├── README.md
├── .gitignore
└── services/
```

Initial `.gitignore`:

```gitignore
.env
*.env
!.env.example

data/
backups/
```

---

## 2. Configure Docker Desktop with WSL2

Install **Docker Desktop for Windows**.

Enable the WSL2 engine:

```text
Docker Desktop
→ Settings
→ General
→ Use the WSL 2 based engine
```

Enable Ubuntu integration:

```text
Docker Desktop
→ Settings
→ Resources
→ WSL Integration
→ Ubuntu ON
```

Verify from Ubuntu:

```bash
docker --version
docker compose version
```

Official reference:

https://docs.docker.com/desktop/features/wsl/

---

## 3. Validate Docker

Before deploying real services, validate Docker Compose with a temporary Nginx container.

Create a test service:

```bash
mkdir -p ~/homelab/services/test
cd ~/homelab/services/test
nano compose.yaml
```

Add:

```yaml
services:
  web:
    image: nginx:alpine
    container_name: homelab-test
    ports:
      - "8080:80"
    restart: unless-stopped
```

Start it:

```bash
docker compose up -d
```

Verify in a browser:

```text
http://localhost:8080
```

Check the container:

```bash
docker compose ps
```

After validation:

```bash
docker compose down
cd ..
rm -r test
```

---

## 4. Configure Git Identity

If Git does not already know the commit author:

```bash
git config --global user.name "Emil Paul"
git config --global user.email "<GITHUB_EMAIL>"
```

Verify:

```bash
git config --global user.name
git config --global user.email
```

---

## 5. Create the GitHub Repository

GitHub repository:

```text
epaul23/epaul-homelab
```

The repository was initially created as **Private** while the project is being developed and reviewed for secrets.

GitHub initialization options:

```text
Template:    No template
README:      Off
.gitignore:  None
License:     None
```

The repository is created empty because the local repository already contains its own files and Git history.

---

## 6. Connect the Local Repository to GitHub

From the local repository:

```bash
cd ~/homelab
```

Add GitHub as the remote:

```bash
git remote add origin https://github.com/epaul23/epaul-homelab.git
```

Ensure the main branch is named `main`:

```bash
git branch -M main
```

Verify the remote:

```bash
git remote -v
```

Expected:

```text
origin  https://github.com/epaul23/epaul-homelab.git (fetch)
origin  https://github.com/epaul23/epaul-homelab.git (push)
```

---

## 7. Authenticate with GitHub CLI

GitHub HTTPS Git operations do not use normal account passwords.

Install GitHub CLI:

```bash
sudo apt update
sudo apt install gh -y
```

Verify:

```bash
gh --version
```

Authenticate:

```bash
gh auth login
```

Selections:

```text
GitHub.com
HTTPS
Authenticate Git with GitHub credentials: Yes
Login with a web browser
```

If WSL cannot open the Windows browser automatically, manually open the device URL shown by GitHub CLI and enter the provided one-time code.

Verify authentication:

```bash
gh auth status
```

Official reference:

https://cli.github.com/manual/gh_auth_login

---

## 8. Git Workflow

Push the main branch for the first time:

```bash
git push -u origin main
```

After the upstream branch is configured, the normal workflow is:

```bash
git status
git add .
git commit -m "Describe change"
git push
```

To retrieve changes made from another machine:

```bash
git pull
```

---

## 9. WSL Storage Capacity Caveat

Applications running inside WSL may report approximately:

```text
1006 GB available
```

This does **not** necessarily represent 1 TB of free physical storage.

WSL2 stores its Linux filesystem inside a dynamically expanding virtual disk. The virtual disk has its own maximum capacity, while actual usable storage is still constrained by the free space on the physical Windows drive.

Production application data will eventually be moved to dedicated external storage.

Microsoft reference:

https://learn.microsoft.com/windows/wsl/disk-space

---

# Troubleshooting

## Docker Works in PowerShell but Not Ubuntu

Confirm both settings are enabled:

```text
Docker Desktop
→ Settings
→ General
→ Use WSL 2 based engine
```

and:

```text
Docker Desktop
→ Settings
→ Resources
→ WSL Integration
→ Ubuntu ON
```

Restart Docker Desktop and WSL if necessary.

---

## Forgotten WSL sudo Password

From **Windows PowerShell**:

```powershell
wsl -u root
```

Reset the Ubuntu user's password:

```bash
passwd emilp
```

Exit:

```bash
exit
```

Verify from the normal Ubuntu account:

```bash
sudo whoami
```

Expected:

```text
root
```

---

## GitHub Rejects Account Password

Example error:

```text
Password authentication is not supported for Git operations.
```

Authenticate using GitHub CLI:

```bash
gh auth login
```

Then retry:

```bash
git push
```

---

# Repository Structure

```text
homelab/
├── .gitignore
├── README.md
├── docs/
│   ├── host-setup.md
│   └── immich-setup.md
│
└── services/
```

Each self-hosted application gets its own directory under `services/`.

Example:

```text
services/
├── immich/
├── nextcloud/
└── monitoring/
```

---

# Current Host Status

Completed:

- Windows 11 host
- Ubuntu on WSL2
- Docker Desktop
- Docker Compose
- WSL2 Docker integration
- Docker networking validation
- Git repository
- GitHub remote repository
- GitHub CLI authentication
- Secret exclusions through `.gitignore`

---

# Planned Host Evolution

```text
Phone / PCs
      │
      ▼
Home Network
      │
      ▼
Dedicated Windows Laptop
      │
      └── WSL2 Ubuntu
              │
              └── Docker Compose
                    │
                    ├── Immich
                    ├── Nextcloud
                    ├── Monitoring
                    └── Other services
                           │
                           ▼
                     External DAS
```

Future work:

- Migrate the stack to the dedicated laptop
- Connect external DAS storage
- Design the final storage layout
- Configure automated backups
- Implement a 3-2-1 backup strategy
- Add drive-health monitoring
- Configure secure remote access
- Add system monitoring
- Create architecture diagrams
- Perform a security review
- Publish the repository as a portfolio project

---

## References

Docker Desktop + WSL2:

https://docs.docker.com/desktop/features/wsl/

GitHub CLI authentication:

https://cli.github.com/manual/gh_auth_login

Microsoft WSL disk management:

https://learn.microsoft.com/windows/wsl/disk-space
