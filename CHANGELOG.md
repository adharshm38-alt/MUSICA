# MUSICA Changelog

All notable changes to the MUSICA project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-14

### Added
- **Official MUSICA Release**: Initial official release of the independent MUSICA music streaming player for Android.
- **Monochrome & Liquid Glass UI**: Clean black/monochrome design with transparent liquid-glass floating bottom dock and circular search button.
- **Root Screen Background Wallpapers**: Custom wallpapers (Mount Fuji Journey, Forest Canopy, Golden Forest Light, Anime Green Tree, Artistic Text, and custom user uploads) applying across all screens (Home, Explore, Library, Settings, Extra Changes, Backgrounds).
- **Dynamic App Logos**: Separate App Logos screen under Settings → Extra Changes with 6 selectable icons (Default red cassette, Black, Lavender, Mint Green, Sky Blue, Pink) using Android `activity-alias` for home screen launcher icon customization.
- **Top Preview for You**: 1-minute video discovery previews (`60_000_000L`) with top-left mute/unmute control and direct fullscreen playback handoff.
- **Mini Player Settings Toggle**: Added setting in Settings to enable or disable the floating/docked mini player while preserving background playback and notification controls.
- **Modular Provider Architecture**: YouTube Music baseline and search, JioSaavn high-fidelity stream matching up to 320kbps, and Spotify playlist import.
- **Discord Rich Presence**: Integrated Rich Presence showing track details, duration, audio quality, and YouTube Music link with all legacy branding removed.
- **Complete Documentation Suite**: Added `ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `DATABASE.md`, `INSTALLATION.md`, `BUILD_GUIDE.md`, `DEPLOYMENT.md`, and `TROUBLESHOOTING.md`.
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
