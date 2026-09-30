# MUSICA

A full-stack community music platform where people upload their own tracks, build playlists,
follow artists, and stream music in a polished dark-themed interface.

Built with **React + Vite** on the front end and **Node.js + Express + MongoDB** on the back end.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [MongoDB setup](#mongodb-setup)
- [Running the app](#running-the-app)
- [Demo accounts](#demo-accounts)
- [Development commands](#development-commands)
- [API reference](#api-reference)
- [Copyright and upload policy](#copyright-and-upload-policy)
- [Security](#security)
- [Deployment](#deployment)
- [Git and GitHub setup](#git-and-github-setup)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### Music
- **Upload tracks** with audio file, title, artist, album, genre, description, release year and cover art
- **Live upload progress bar** with percentage feedback
- **File validation** - type, size and count limits enforced on both client and server
- **Audio duration** read from the file on upload
- **Persistent player** - a single `<audio>` element that survives navigation
- **Playback controls** - play/pause, previous, next, seek, volume, mute, shuffle, repeat (off / all / one)
- **Full-screen mobile player** with an animated blurred backdrop derived from the cover art
- **Queue** support, including "play this list from here"
- **Music visualizer** built with pure CSS (no canvas, no WebAudio)

### Community
- **Accounts** - register, log in, log out, protected routes, optional profile picture
- **Profiles** - bio, follower/following counts, uploads, public playlists, joined date
- **Follow system** - follow and unfollow any artist, with optimistic UI updates
- **Likes** - like and unlike songs; counts stay accurate and likes are idempotent
- **Reports** - report a song or a profile for copyright, inappropriate content, spam or other

### Playlists
- Create, rename, describe, and delete playlists
- Add and remove songs, with automatic duplicate prevention
- **Reorder tracks** with up/down controls that persist to the database
- Public or private visibility
- Custom cover art, falling back to the first track's artwork

### Discovery
- **Search** across songs, artists, albums and playlists, with tabbed results
- Weighted MongoDB text index so title matches rank above genre matches
- Home rails: Recently Added, Trending Now, Most Played, Popular Artists, Featured Playlists, Recently Played
- Genre browsing on the Discover page

### Library
- Liked Songs, Recently Played, Playlists and My Uploads in one place
- **Recently Played is bounded** - one row per user/song pair, capped at 200 entries, so history never grows without limit

### Admin
- Dashboard with headline statistics
- **Report queue** - review, resolve or dismiss reports
- **User management** - promote/demote admins, activate/deactivate accounts
- **Upload moderation** - remove unauthorised uploads (deletes the stored file too)
- Admin routes are protected by both authentication and role checks

### Interface
- Dark theme with purple/blue/pink gradient accents and glassmorphism
- Left sidebar on desktop, bottom navigation bar on mobile
- Responsive from 320px phones up to large desktops
- Toast notifications, loading skeletons, empty states, error states
- Custom 404 page
- Keyboard navigation, ARIA labels, visible focus rings
- `prefers-reduced-motion` respected globally

---

## Tech stack

| Layer | Choice |
|---|---|
| Front end | React 18, React Router 7, Vite 6 |
| Styling | Tailwind CSS 4 (CSS-first config) |
| HTTP | Axios |
| Back end | Node.js 24, Express 4 (ES modules) |
| Database | MongoDB 8 via Mongoose 8 |
| Auth | JSON Web Tokens, bcrypt password hashing |
| Uploads | Multer, local filesystem storage driver (swappable) |
| Security | Helmet, CORS, express-rate-limit, express-validator |

No icon library is used - icons are inline SVG, which keeps the bundle small.

---

## Project structure

```
MUSICA/
├── client/                      # React front end
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/            # register field definitions
│   │   │   ├── layout/          # AppShell, Sidebar, MobileTopBar, MobileBottomNav, Logo, AuthLayout
│   │   │   ├── music/           # SongCard, SongRow, SongCover, Visualizer
│   │   │   ├── player/          # MusicPlayer, FullPlayer, ProgressBar
│   │   │   └── ui/              # Icon, Avatar, EmptyState, Skeleton, SectionHeader, ReportDialog
│   │   ├── context/             # AuthContext, PlayerContext, ToastContext
│   │   ├── hooks/               # useFetch, useSocial
│   │   ├── pages/               # one file per route
│   │   ├── services/            # API client + per-domain service wrappers
│   │   ├── utils/               # formatting helpers, event bus
│   │   ├── App.jsx              # routes and guards
│   │   ├── main.jsx             # React entry point
│   │   ├── navigation.js        # sidebar / bottom-nav definitions
│   │   └── index.css            # design tokens and component classes
│   ├── capacitor.config.json
│   ├── android/                      # Capacitor Android project
│   ├── .env.example
│   └── vite.config.js
│
├── scripts/
│   ├── build-apk.sh                  # one-command Android build
│   └── make-android-icons.mjs        # generates the MUSICA launcher icon
│
├── server/                      # Express back end
│   ├── src/
│   │   ├── config/              # env.js, db.js
│   │   ├── controllers/         # one file per resource
│   │   ├── middleware/          # auth, upload, validate, error
│   │   ├── models/              # User, Song, Playlist, Like, Follow, ListeningHistory, Report
│   │   ├── routes/              # route definitions, mounted in index.js
│   │   ├── services/
│   │   │   ├── storage/         # storage facade + local driver
│   │   │   └── token.service.js
│   │   ├── seed/seed.js         # demo data generator
│   │   ├── utils/               # ApiError, asyncHandler, response helpers
│   │   ├── app.js               # Express app assembly
│   │   └── index.js             # server entry point
│   ├── uploads/                 # uploaded audio and images (git-ignored)
│   ├── .env.example
│   └── package.json
│
├── package.json                 # npm workspaces + shared scripts
└── README.md
```

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | 24 LTS recommended |
| npm | 10 or newer | ships with Node |
| MongoDB | 7 or newer | local install, Docker, or Atlas |
| Git | any | for version control |

Check your versions:

```bash
node --version
npm --version
mongod --version     # skip if using Docker or Atlas
```

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/MUSICA.git
cd MUSICA

# 2. Install dependencies for both front end and back end
npm install
```

That single command installs everything, because this project uses npm workspaces.

### Set up environment files

```bash
# Back end
cp server/.env.example server/.env

# Front end
cp client/.env.example client/.env
```

Then generate a strong JWT secret and paste it into `server/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Environment variables

### `server/.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `5000` | Port the API listens on |
| `NODE_ENV` | no | `development` | Set to `production` in production |
| `MONGODB_URI` | **yes** | `mongodb://127.0.0.1:27017/musica` | MongoDB connection string |
| `JWT_SECRET` | **yes** | - | Signing key for auth tokens. Use a long random string |
| `JWT_EXPIRES_IN` | no | `7d` | How long sessions last |
| `CLIENT_URL` | no | `http://localhost:5173` | Allowed CORS origin (comma-separated for multiple) |
| `MAX_AUDIO_SIZE_MB` | no | `25` | Per-file audio upload limit |
| `MAX_IMAGE_SIZE_MB` | no | `5` | Per-file image upload limit |
| `STORAGE_DRIVER` | no | `local` | Which storage driver to use |
| `UPLOADS_DIR` | no | `uploads` | Upload folder, relative to `server/` |

### `client/.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_API_URL` | no | `/api` | Backend base URL. Leave as-is to use the dev proxy |

> `.env` files are git-ignored. Only the `.env.example` files are committed.
> Never put real passwords, API keys or database credentials in a committed file.

---

## MongoDB setup

Pick whichever option suits you.

### Option A - Docker (easiest)

```bash
docker run -d --name musica-mongo -p 27017:27017 mongo:8
```

### Option B - Local install

```bash
# Arch / CachyOS
sudo pacman -S mongodb

# Ubuntu / Debian
sudo apt install mongodb-org

# macOS (Homebrew)
brew install mongodb-community

# Windows: download the MSI from mongodb.com
```

Then start it:

```bash
sudo systemctl start mongod      # Linux
brew services start mongodb-community   # macOS
```

### Option C - MongoDB Atlas (cloud, free tier)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Add your IP to the access list.
3. Copy the connection string and put it in `server/.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/musica?retryWrites=true&w=majority
```

### Verify the connection

```bash
curl http://localhost:5000/api/health
```

```json
{ "success": true, "data": { "status": "ok", "uptime": 12.4 } }
```

### Indexes

Indexes are declared in the Mongoose models and are created automatically on first run.
They cover the sorted feeds (`createdAt`, `playCount`, `likeCount`), the text search
index, and unique constraints that make likes, follows, history and reports idempotent.

To rebuild them explicitly:

```bash
npm run check      # syntax check
# or trigger automatic creation by starting the server once
```

---

## Running the app

You need **two terminals**.

**Terminal 1 - back end**

```bash
npm run dev:server
```

```
  MUSICA API ready
  ➜  Local:    http://localhost:5000/api
  ➜  Health:   http://localhost:5000/api/health
  ➜  Uploads:  /path/to/MUSICA/server/uploads
```

**Terminal 2 - front end**

```bash
npm run dev:client
```

```
  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser.

> Vite proxies `/api` and `/uploads` to `http://localhost:5000`, so the front end
> talks to the back end without CORS problems during development.

### Both at once

```bash
npm run dev
```

This starts both with colour-coded output (`SERVER` and `CLIENT`).

---

## Demo accounts

Load the sample data:

```bash
npm run seed
```

This creates five users, nine generated audio tracks with cover art, likes,
follows, playlists and listening history. The audio is synthesised tones, not
copyrighted music.

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@musica.dev` | `admin12345` |
| User | `nova@musica.dev` | `password123` |
| User | `echo@musica.dev` | `password123` |
| User | `rhythm@musica.dev` | `password123` |
| User | `lumen@musica.dev` | `password123` |

Log in as the admin and visit `/admin` for the moderation dashboard.

To add the demo data **without** wiping what you already have:

```bash
npm run seed -- --keep
```

---

## Development commands

Run these from the project root:

| Command | What it does |
|---|---|
| `npm run dev` | Start front end and back end together |
| `npm run dev:server` | Start only the Express API (auto-restarts on change) |
| `npm run dev:client` | Start only the Vite dev server (hot reload) |
| `npm run build` | Build the front end for production into `client/dist` |
| `npm start` | Run the built back end (serves the API) |
| `npm run seed` | Reset and load demo data |
| `npm run check` | Syntax check the back end |

Useful from inside `server/`:

```bash
npm run dev     # node --watch, restarts on file changes
npm run seed
```

Useful from inside `client/`:

```bash
npm run dev
npm run build
npm run preview # serve the production build locally
```

---

## API reference

All responses share an envelope:

```json
{ "success": true, "data": { } }
```

Errors:

```json
{ "success": false, "message": "Human readable message", "details": [ ] }
```

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | - | Liveness check |

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | - | Create an account (optionally with `avatar`) |
| POST | `/api/auth/login` | - | Log in, returns a token |
| POST | `/api/auth/logout` | - | Clear the session cookie |
| GET | `/api/auth/me` | required | Current user |
| PUT | `/api/auth/password` | required | Change your password |
| DELETE | `/api/auth/account` | required | Delete your account and its uploads |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/users/:id` | optional | Public profile with songs, playlists, followers, following |
| PUT | `/api/users/:id` | owner/admin | Update display name, bio, email, avatar |
| POST | `/api/users/:id/follow` | required | Follow a user |
| DELETE | `/api/users/:id/follow` | required | Unfollow a user |
| GET | `/api/users/:id/connections?type=followers\|following` | optional | Paginated connections list |

### Songs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/songs` | optional | Paginated list. Query: `page`, `limit`, `sort=newest\|popular\|liked\|title`, `genre`, `album`, `uploadedBy` |
| GET | `/api/songs/discover` | optional | Everything the home page needs in one call |
| GET | `/api/songs/liked` | required | Songs you liked |
| GET | `/api/songs/mine` | required | Songs you uploaded |
| GET | `/api/songs/:id` | optional | One song (increments the play count) |
| POST | `/api/songs` | required | Upload (`multipart/form-data`: `audio`, optional `cover`) |
| PUT | `/api/songs/:id` | owner/admin | Edit metadata, replace cover |
| DELETE | `/api/songs/:id` | owner/admin | Delete the song and its files |
| POST | `/api/songs/:id/like` | required | Like (idempotent) |
| DELETE | `/api/songs/:id/like` | required | Remove a like |
| POST | `/api/songs/:id/play` | optional | Record a play |

### Playlists

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/playlists?scope=mine\|public` | optional | List playlists |
| POST | `/api/playlists` | required | Create a playlist |
| GET | `/api/playlists/:id` | optional | Playlist with its songs |
| PUT | `/api/playlists/:id` | owner/admin | Rename, describe, change visibility or cover |
| DELETE | `/api/playlists/:id` | owner/admin | Delete the playlist |
| POST | `/api/playlists/:id/songs` | owner | Add songs (`songId` or `songIds`) |
| DELETE | `/api/playlists/:id/songs/:songId` | owner | Remove a song |
| PUT | `/api/playlists/:id/songs/order` | owner | Reorder (`songIds` must be the same set) |

### Search, history, reports

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/search?q=&type=all\|songs\|artists\|albums\|playlists` | optional | Full search |
| GET | `/api/search/suggest?q=` | optional | Type-ahead suggestions |
| GET | `/api/history` | required | Recently played, newest first |
| DELETE | `/api/history` | required | Clear history |
| DELETE | `/api/history/:songId` | required | Remove one entry |
| POST | `/api/reports` | required | Report a song or user |
| GET | `/api/reports/mine` | required | Reports you filed |

### Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/stats` | admin | Dashboard statistics |
| GET | `/api/admin/users` | admin | Paginated user list |
| PUT | `/api/admin/users/:id/role` | admin | Promote or demote |
| PUT | `/api/admin/users/:id/status` | admin | Activate or deactivate |
| GET | `/api/admin/songs` | admin | Paginated upload list |
| DELETE | `/api/admin/songs/:id` | admin | Remove an upload and its files |
| GET | `/api/admin/reports?status=` | admin | Report queue |
| PUT | `/api/admin/reports/:id` | admin | Change status, add a resolution note |

### Example

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nova@musica.dev","password":"password123"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl http://localhost:5000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## Copyright and upload policy

**MUSICA is built for music that users own or are authorised to distribute.**

### What users must agree to

Both the registration form and the upload page require an explicit confirmation:

> I own this recording, or I have written permission from the rights holder to distribute it
> on MUSICA. I understand that infringing uploads may be removed without notice.

The upload API rejects any request where `rightsConfirmed` is not `true`, and stores an
optional rights note alongside the song record.

### What is not allowed

- Commercial copyrighted music you did not create or license
- Remixes, covers and samples without permission from the rights holders
- Album art, photographs or logos belonging to other people
- Anything illegal, hateful, or sexually explicit
- Spam, impersonation, or misleading metadata

### How enforcement works

1. Any user can report a song or a profile for **copyright**, **inappropriate content**,
   **spam**, or **other**.
2. Reports appear in the admin queue with a snapshot of the item.
3. Admins can resolve or dismiss a report, and remove the offending upload. Removing a song
   also deletes the stored audio and cover files, and cleans up its likes and history rows.
4. Admins can deactivate accounts that repeatedly upload infringing material.

### Note on discovery

The Discover and Home feeds rank by **recency, play count and like count**. These are simple
transparent popularity signals, not machine-learning recommendations, and the interface does
not claim otherwise.

---

## Security

Implemented measures:

| Area | Implementation |
|---|---|
| Password storage | bcrypt with 12 salt rounds, hashed in a Mongoose pre-save hook |
| Password exposure | `select: false` on the field, plus a `toJSON` transform that strips it |
| Token handling | JWT signed with `JWT_SECRET`; also set as an `httpOnly`, `sameSite=lax` cookie |
| Token verification | Signature checked on every request; `alg: none` and tampered tokens rejected |
| Authorisation | Owner-or-admin checks on every mutating route |
| Admin isolation | `requireAuth` **and** `requireAdmin` on all `/api/admin` routes |
| Input validation | `express-validator` chains plus Mongoose schema constraints |
| File validation | MIME allow-list, per-file size limits, file count limits, randomised filenames |
| Upload safety | Files are written outside the web root context and served read-only from `/uploads` |
| Rate limiting | Strict limit on login and register, broader limit across the API |
| HTTP headers | Helmet |
| CORS | Restricted to `CLIENT_URL` with credentials enabled |
| Error handling | Single error middleware; stack traces never sent in production |
| User enumeration | Login returns the same message for unknown email and wrong password |
| Injected input | User text is escaped before being used in RegExp or search filters |

### Verifying it yourself

```bash
# Unauthenticated access is blocked
curl -i http://localhost:5000/api/songs/liked        # 401

# Non-admins cannot reach admin routes
curl -i http://localhost:5000/api/admin/stats -H "Authorization: Bearer $TOKEN"   # 403

# Forged tokens are rejected
curl -i http://localhost:5000/api/auth/me -H "Authorization: Bearer eyJhbGciOiJub25lIn0.x.y"   # 401
```

---

## Deployment

### Option A - Render (back end) + Vercel / Netlify (front end)

**Back end (Render):**

1. Push the repo to GitHub.
2. New → Web Service → connect the repository.
3. Settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Root directory: leave blank
4. Environment variables:
   ```
   NODE_ENV=production
   MONGODB_URI=<your Atlas connection string>
   JWT_SECRET=<a long random string>
   CLIENT_URL=https://<your-frontend-domain>
   ```
5. For uploaded files to persist, mount a disk at `/opt/render/project/src/server/uploads`,
   or point `UPLOADS_DIR` at the mount path. On ephemeral filesystems, uploaded media will be
   lost on redeploy - use S3/R2 in production by adding a storage driver.

**Front end (Vercel):**

1. Import the repository.
2. Set the root directory to `client`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Environment variable: `VITE_API_URL=https://<your-backend-domain>/api`

### Option B - Docker

```bash
docker build -t musica-server .
docker run -d -p 5000:5000 --env-file server/.env musica-server
```

### Moving file storage to the cloud

The storage layer is deliberately isolated in `server/src/services/storage/`.
To swap local disk for S3, Cloudflare R2 or similar:

1. Create `s3.driver.js` next to `local.driver.js` exposing
   `save`, `saveDataUrl`, `remove` and `getUrl`.
2. Register it in `storage/index.js`:

   ```js
   const DRIVERS = {
     local: localDriver,
     s3: s3Driver,
   }
   ```

3. Set `STORAGE_DRIVER=s3` in the environment.

No controller or route changes are needed.

---

## Git and GitHub setup

The repository is already initialised with a complete `.gitignore`.

```bash
git status                     # review before committing
git add .
git commit -m "Initial commit: MUSICA"
git branch -M main
git remote add origin https://github.com/<your-username>/MUSICA.git
git push -u origin main
```

### What is never committed

Confirmed by `.gitignore`:

- `node_modules/`
- `.env` and any `.env.*` file except `.env.example`
- `server/uploads/` (all uploaded audio and images)
- `client/dist/` build output
- Logs, caches, editor folders, OS files

Before your first push, double-check nothing sensitive slipped in:

```bash
git status --ignored | head -20
git ls-files | grep -E "\.env$|uploads/"   # should print nothing
```

---

## Troubleshooting

**`MONGODB_URI` connection error on start**

MongoDB is not running. Start it, or update `MONGODB_URI` in `server/.env`.
The server prints the exact connection string it tried to use.

**`Cannot reach the MUSICA server` toast in the browser**

The back end is not running on port 5000. Start it with `npm run dev:server`.

**`JWT_SECRET` error**

Copy `server/.env.example` to `server/.env` and set a real secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**`command not found: node`**

Node.js is not on your PATH. Install Node 20+ from [nodejs.org](https://nodejs.org)
or via nvm, then open a new terminal.

**Port 5000 or 5173 already in use**

```bash
# Linux
sudo lsof -i :5000
kill -9 <PID>

# Or change the port in the relevant .env / vite.config.js
```

**Uploads fail with "File is too large"**

Raise `MAX_AUDIO_SIZE_MB` in `server/.env`. Note that MongoDB is not the constraint -
files live on disk.

**Audio plays but the progress bar shows 0:00**

The duration is read from the file on upload. For files where the header cannot be parsed,
the browser fills it in once playback starts.

**Changes to the back end are not picked up**

`npm run dev:server` uses `node --watch` and restarts automatically. If you stopped using
that script, use it instead of `npm start`.

**Reset everything and start clean**

```bash
npm run seed      # drops and reloads all collections
```

---

## License

This project is provided as an educational starting point. You are free to use, modify and
extend it for your own portfolio, coursework or projects.

Uploaded content remains the property of whoever owns the rights to it. MUSICA provides
tooling for sharing music you own; it does not grant any rights to distribute music you
do not own.

---

## Android app (Capacitor)

MUSICA ships as an Android app built with **Capacitor**, which wraps the existing
Vite/React build in a native Android shell. The React UI is unchanged — the APK
contains the exact same `client/dist` bundle the web app serves.

- App name: **MUSICA**
- App ID: **com.musica.app**
- Minimum Android: 5.1 (API 22)
- Wrapper: Capacitor 6 (real Android WebView, so the `<audio>` player and
  Media Session behave as they do on the web)

### Prerequisites

Building an APK needs a JDK 17+ and the Android SDK:

```bash
# JDK 17 (skip if already installed)
# https://adoptium.net/temurin/releases/?version=17

# Android SDK command-line tools -> https://developer.android.com/studio
# Then, accepting the licences:
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

Point the shell at both:

```bash
export JAVA_HOME="$HOME/.local/opt/jdk17"          # or your JDK path
export ANDROID_HOME="$HOME/.local/opt/android-sdk"  # or your SDK path
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

### Build the debug APK

```bash
# One command does everything: web build -> cap sync -> icons -> gradle
./scripts/build-apk.sh
```

Or step by step:

```bash
npm run build                 # build the web app
cd client
npx cap sync android          # copy dist/ into the Android project
cd ..
node scripts/make-android-icons.mjs
cd client/android
./gradlew assembleDebug
```

APK output:

```
client/android/app/build/outputs/apk/debug/app-debug.apk
```

### Pointing the app at your server

A phone cannot reach `localhost` on your computer, so the app ships with a
**Music server** field in *Settings* where you enter your computer's LAN address:

```
http://<your-computer-LAN-IP>:5000/api
```

Find your LAN IP:

```bash
hostname -I | awk '{print $1}'
# or
ip -4 addr show scope global | grep -oP '(?<=inet\s)\d+(\.\d+){3}'
```

The phone and the computer must be on the same Wi-Fi network, and the MUSICA
backend must be listening on `0.0.0.0` (not just `127.0.0.1`) so it accepts
connections from the network. `server/.env` already sets
`CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173`; for the Android app,
add your LAN origin there too if you see CORS errors:

```
CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173,http://<your-LAN-IP>:5173
```

The server URL is stored in `localStorage` under `musica.apiUrl` and resolved at
runtime (see `client/src/config/runtime.js`), so one APK can be pointed at
different servers without rebuilding.

Cleartext `http://` is enabled for development via
`client/android/app/src/main/res/xml/network_security_config.xml`. Remove that
file (and the matching `android:networkSecurityConfig` attribute in
`AndroidManifest.xml`) once you serve the API over HTTPS.

### Release (signed) build

For a Play-Store-ready build, generate a keystore and a release config:

```bash
keytool -genkey -v -keystore ~/musica-release.keystore \
  -alias musica -keyalg RSA -keysize 2048 -validity 10000
```

Create `client/android/keystore.properties` (git-ignored):

```
storeFile=/home/<you>/musica-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=musica
keyPassword=YOUR_KEY_PASSWORD
```

Then:

```bash
cd client/android && ./gradlew assembleRelease
```

Never commit the keystore or `keystore.properties` — both are in `.gitignore`.
