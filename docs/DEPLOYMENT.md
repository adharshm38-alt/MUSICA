# MUSICA Backend Deployment Guide

This guide describes how to deploy the MUSICA backend services for production use so the Android client functions completely independently without relying on a local development laptop.

---

## 1. Services Architecture

MUSICA features two lightweight backend services:

1. **Listen Together Party Server (Go)**:
   - High-performance, zero-database WebSocket hub.
   - Synchronizes playback queues, playback positions, and party state across multiple devices.
   - Health check endpoint: `GET /healthz`
2. **Proton Mail Auth & Cloud Sync (Node.js)**:
   - Manages passwordless email verification (OTP) via Resend.
   - Persists encrypted user sync data (pinned playlists, active wallpapers, favorite songs).
   - Health check endpoint: `GET /health`

---

## 2. Deploying to Render (Recommended)

Render provides a seamless, zero-maintenance hosting solution.

### 2.1 Option A: One-Click Blueprint Deployment
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Blueprint**.
3. Connect your repository: `https://github.com/adharshm38-alt/MUSICA`.
4. Render will parse `backend/render.yaml` automatically and configure:
   - **Service Name**: `musica-listen-together`
   - **Runtime**: Go
   - **Build Command**: `go build -o server .`
   - **Start Command**: `./server`
   - **Health Check Path**: `/healthz`
5. Click **Apply**. Once built, note your service URL (e.g., `https://musica-jam.onrender.com`).

### 2.2 Option B: Manual Service Creation
- **Environment**: Go
- **Root Directory**: `backend`
- **Build Command**: `go build -o server .`
- **Start Command**: `./server`
- **Port**: `8080` (or leave default `$PORT`)
- **Environment Variables**:
  - `JAM_MAX_MEMBERS`: `5`
  - `JAM_STATE_HEARTBEAT_MS`: `5000`
  - `JAM_MAX_UPCOMING_QUEUE`: `50`

---

## 3. Deploying to a Linux VPS (Ubuntu/Debian)

### 3.1 Install Go & Build Binary
```bash
sudo apt update && sudo apt install -y golang-go git
git clone https://github.com/adharshm38-alt/MUSICA.git /opt/musica
cd /opt/musica/backend
go build -o musica-server .
```

### 3.2 Systemd Service Configuration
Create `/etc/systemd/system/musica-jam.service`:

```ini
[Unit]
Description=MUSICA Listen Together Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/musica/backend
ExecStart=/opt/musica/backend/musica-server
Restart=always
RestartSec=5
Environment=PORT=8080
Environment=JAM_MAX_MEMBERS=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now musica-jam.service
sudo systemctl status musica-jam.service
```

### 3.3 Reverse Proxy & SSL (Caddy)
Add to `/etc/caddy/Caddyfile`:

```caddy
jam.yourdomain.com {
    reverse_proxy localhost:8080
}
```
Reload Caddy:
```bash
sudo systemctl reload caddy
```

---

## 4. Connecting the Android App to Your Backend

Once your server is deployed, update your client in either of two ways:

1. **Compile-time Configuration**:
   In `local.properties`:
   ```properties
   LISTEN_TOGETHER_SERVER=https://jam.yourdomain.com
   ```
2. **In-App Dynamic Override**:
   Open **Settings → Listen Together Server**, enter your URL, and tap Save. The URL persists across app launches.
