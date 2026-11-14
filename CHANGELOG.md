# MUSICA Changelog

All notable changes to the MUSICA project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.3] - 2026-11-14

### Added
- **Complete MUSICA Product Identity**: Established independent branding, official cassette pixel-art logo, high-resolution dark banners, and updated repository metadata.
- **Root Screen Background Wallpapers**: Custom wallpapers (Mount Fuji, Anime Night, Cyberpunk Neon, Minimal Wave, and custom user uploads) now apply across all major app screens (Home, Explore, Library, Settings, Extra Changes, Backgrounds) behind translucent UI surfaces. Default Black restores pure OLED black everywhere.
- **Dynamic App Logos**: Added separate App Logos customization screen under Settings → Extra Changes with 6 selectable icons (Default, Black, Lavender, Mint Green, Sky Blue, Pink) utilizing Android `activity-alias` components for real home screen launcher and app drawer icon switching.
- **1-Minute Video Discovery Previews**: Upgraded Home video discovery previews from 12s to full 1-minute clips (`60_000_000L`) backed by dedicated disk LRU cache.
- **Preview Sound ON/OFF Toggle**: Added dedicated top-left sound icon control to the active video discovery card for optional audible preview listening without breaking background music state.
- **Mini Player Settings Toggle**: Added setting in Settings → Appearance to enable or disable the floating/docked mini player.
- **Complete Project Documentation Suite**: Added `ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `DATABASE.md`, `INSTALLATION.md`, `BUILD_GUIDE.md`, `DEPLOYMENT.md`, and `TROUBLESHOOTING.md` in `docs/`.
- **GitHub Community Standards**: Added `SECURITY.md`, Issue Templates for Bug Reports and Feature Requests, and Pull Request Template.

### Changed
- **Discord Rich Presence Refinement**: Removed Discord card from Settings → Account & Integrations while preserving the dedicated Discord Rich Presence configuration page. Removed external "Visit BitChord" button and click action from the preview card, keeping "Listening to MUSICA" heading, playback progress, and "Listen on YouTube Music" button.
- **TV and Watch Submodules**: Updated user-facing display titles, dialog headers, and remote pairing pages from "BitChord TV" to "MUSICA TV".
- **Backend Party Server**: Updated Go Listen Together invitation landing page and metadata to MUSICA with links to official releases.
- **CI/CD Workflow Artifacts**: Renamed release output artifacts in GitHub Workflows to `musica-prod-release-signed`, `musica-wear-prod-release-signed`, and `musica-tv-dev-debug`.

### Fixed
- Fixed wallpaper only rendering inside gallery preview cards by binding `AppBackgroundWallpaper` to the root view hierarchy.
- Fixed video discovery card selection ensuring each card retains its specific video ID and launches the exact corresponding full-screen video feed.
- Prevented audio focus conflicts during silent video discovery browsing.

---

## [1.1.0] - 2026-11-01

### Added
- **Liquid Glass Navigation Dock**: Smooth folding bottom bar on Android 12+ combining navigation tabs with docked now-playing controls.
- **Official Music Video Ranker**: Intelligent verification prioritizing official record labels and artist channels over unofficial reuploads.
- **Proton Mail Integration**: Passwordless OTP login and cloud preference sync.
- **Spotify Playlist Importer**: Import playlists and Liked Songs into local MUSICA library.

---

## [1.0.0] - 2026-10-15

### Added
- Initial standalone release of MUSICA Android music streaming player.
- YouTube Music streaming and search via InnerTube with NewPipeExtractor fallback.
- Local on-device listening statistics and monthly replay metrics.
- Word-synced lyrics with real-time translation support.
- Android TV and Wear OS companion modules.
- Listen Together WebSocket party server.
