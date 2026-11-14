# MUSICA API Documentation

This document specifies all internal and external communication protocols, streaming resolver endpoints, lyrics integration APIs, and backend service contracts used by MUSICA.

---

## 1. Streaming & InnerTube Extraction Pipeline

MUSICA interacts with YouTube Music's InnerTube client API to retrieve catalogue data, search results, browse shelves, and streaming playback URLs.

### 1.1 Client Context Configuration
```json
{
  "context": {
    "client": {
      "clientName": "WEB_REMIX",
      "clientVersion": "1.20241104.01.00",
      "hl": "en",
      "gl": "US"
    }
  }
}
```

### 1.2 Endpoints

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `https://music.youtube.com/youtubei/v1/search` | `POST` | Global search query filtering for tracks, albums, artists, or community playlists |
| `https://music.youtube.com/youtubei/v1/browse` | `POST` | Home screen recommendation shelves, artist discography, and charts |
| `https://music.youtube.com/youtubei/v1/player` | `POST` | Stream URL resolution, audio format multiplexing, and playback tracking |
| `https://music.youtube.com/youtubei/v1/next` | `POST` | Autoplay queue generation, radio stations, and related music recommendations |

### 1.3 Format Selection & Stream Resolution
- Preferred audio formats:
  1. **Opus 251**: 160 kbps, 48 kHz, 16-bit
  2. **AAC 140**: 128–256 kbps, 44.1 kHz, 16-bit
  3. **Video Streams**: 360p / 480p / 720p H.264/AVC with chunked range loading for Stage 1 carousel previews and Stage 2 full music video feeds.

---

## 2. Listen Together (Party Server) WebSocket Protocol

The party server synchronizes music playback across up to five concurrent mobile and TV devices without centralized stream relaying.

### 2.1 Connection
- **URL**: `wss://<LISTEN_TOGETHER_SERVER>/ws?code=<PARTY_CODE>&clientId=<CLIENT_ID>`
- **Transport**: Standard WebSocket (RFC 6455)

### 2.2 Clock Synchronization
Each client calculates its clock offset relative to the server clock:

```
Client -> Server: {"type": "ping", "clientMs": 1700000000000}
Server -> Client: {"type": "pong", "clientMs": 1700000000000, "serverMs": 1700000000045}

Clock Offset = serverMs - ((clientSendMs + clientReceiveMs) / 2)
```

### 2.3 Party State Broadcast Frame
```json
{
  "type": "state",
  "code": "A8X2K9",
  "track": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Never Gonna Give You Up",
    "artist": "Rick Astley",
    "durationMs": 213000
  },
  "positionMs": 45200,
  "anchorMs": 1700000000100,
  "isPlaying": true,
  "controllerId": "client-device-01",
  "members": [
    {"id": "client-device-01", "name": "Pixel 8 Pro", "isHost": true},
    {"id": "client-device-02", "name": "Galaxy S24", "isHost": false}
  ]
}
```

---

## 3. Proton Mail & Cloud Storage REST API

The Node.js authentication service handles passwordless email OTP verification and encrypted user preference syncing.

### 3.1 Health Check
- **Endpoint**: `GET /health`
- **Response**: `200 OK`
```json
{
  "status": "healthy",
  "service": "musica-proton-auth",
  "timestamp": 1700000000000
}
```

### 3.2 Request Email OTP
- **Endpoint**: `POST /api/auth/send-otp`
- **Request Body**:
```json
{
  "email": "user@proton.me"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "OTP sent successfully to user@proton.me",
  "cooldownSeconds": 60
}
```

### 3.3 Verify Email OTP
- **Endpoint**: `POST /api/auth/verify-otp`
- **Request Body**:
```json
{
  "email": "user@proton.me",
  "otp": "482910"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "token": "musica_session_9f82bc7a...",
  "userId": "usr_7a810b..."
}
```

### 3.4 Sync Cloud User Data
- **Endpoint**: `POST /api/user/data`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
```json
{
  "pinnedPlaylists": ["PL123...", "PL456..."],
  "customWallpaperId": "mount_fuji",
  "selectedAppLogo": "black",
  "favoriteSongIds": ["s_01", "s_02"]
}
```

---

## 4. Lyrics Provider APIs

| Provider | Endpoint | Format | Synced |
| :--- | :--- | :--- | :--- |
| **LRCLIB** | `https://lrclib.net/api/get` | Plain / Synced LRC | Syllable & Line |
| **KuGou** | `http://krcs.kugou.com/search` | KRC (Encrypted LRC) | Syllable |
| **Genius** | `https://api.genius.com/search` | HTML Annotation | Unsynced |
| **BetterLyrics** | Internal TTML provider | Timed Text TTML | Syllable & Line |
