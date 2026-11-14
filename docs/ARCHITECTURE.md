# MUSICA Architecture & Technical Specification

MUSICA is an independent, high-performance Android music streaming and listening application engineered with modern Kotlin Multiplatform (KMP), Jetpack Compose, AndroidX Media3, and high-fidelity native C++ audio digital signal processing (DSP).

---

## 1. High-Level Architecture

MUSICA follows a modular, reactive architecture decoupled into distinct functional layers:

```
┌─────────────────────────────────────────────────────────────┐
│                       Presentation Layer                    │
│      Jetpack Compose • Material 3 • Haze • LiquidGlass      │
│  Home • Radio • Library • Search • Mini Player • Full Player│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    State & View Models                      │
│        MainViewModel • PlayerConnection • AppNavigator      │
│     DiscoveryPreviewPool • TopPreviewPlayer • ReplayState   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                   Domain & Playback Core                    │
│      Media3 ExoPlayer • PlaybackService • MediaSession      │
│   AudioCache • ChunkedDataSource • PeakLimiter • Equalizer  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Native C++ Audio Processing                │
│   Mel Spectrogram • Vocal Tracker • Beat Tracker • LoopMix  │
│          FFmpeg JNI • Oboe • Bit-Perfect USB Driver         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│               Data, Providers & Cloud Sync                  │
│    YouTube Music (InnerTube) • NewPipeExtractor Fallback    │
│ JioSaavn 320kbps • Spotify Importer • Proton Auth • Discord │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Module Breakdown

| Module | Description | Key Technologies |
| :--- | :--- | :--- |
| **`:app`** | Primary Android application module (Phone & Tablet) | Android 8.0+ (API 26–36), Jetpack Compose, Media3, NDK CMake |
| **`:shared`** | Core business logic, data repositories, streaming models | Kotlin Multiplatform (JVM/Android), Ktor, OkHttp, Kotlinx Serialization |
| **`:sharedUi`** | Cross-platform Composable UI components, design system | Compose Multiplatform, Coil3, Compose Resources |
| **`:tv`** | Android TV / Google TV interface (Leanback remote-first) | Compose for TV, D-Pad navigation, Mobile pairing server |
| **`:wearos`** | Wear OS companion watch client | Wear Compose, Ongoing media session notifications, WatchFace tile |
| **`:native`** | Native audio analysis, automix loop mixing, and codecs | C++20, CMake 3.22+, Android NDK, Oboe, FFmpeg |
| **`backend/`** | Listen Together party server & Cloud Authentication | Go (WebSocket hub), Node.js (Proton Mail OTP / SQLite) |

---

## 3. Playback & Audio Engine

### 3.1 Playback Service
- **Class**: `PlaybackService` (`androidx.media3.session.MediaSessionService`)
- Runs as an active Android foreground service with a persistent media notification.
- Supports lockscreen transport controls, headphone media button events, Bluetooth AVRCP controls, and Android Auto playback commands.
- Implements audio focus handling: ducks playback during temporary interruptions (navigation announcements) and pauses on phone calls or transient focus loss.

### 3.2 Audio Cache Architecture
- **Class**: `AudioCache`
- Implements dual-tier caching:
  1. **Memory Buffer**: Retains decoded PCM blocks and upcoming queue audio headers.
  2. **Disk LRU Cache**: SimpleCache backed by Android internal storage (`/data/user/0/com.music.bitchord/cache/audio`). Caches full audio streams (Opus 160kbps, AAC 256kbps, FLAC lossless) to enable instantaneous replay and offline playback without redundant network consumption.

### 3.3 Native Signal Processing (DSP) & Automix
- Native audio processing engine compiled via CMake:
  - **`mel_spectrogram.cpp`**: Extracts 80-band Mel-frequency spectrograms from raw PCM data.
  - **`tempo_analysis.cpp` / `BeatTracker.kt`**: Extracts BPM and beat grids with millisecond precision.
  - **`vocal_spectrogram.cpp` / `VocalTracker.kt`**: Identifies vocal entry and exit timestamps to avoid vocal clashes during song transitions.
  - **`loop_mix_renderer.cpp`**: Dual-deck audio mixer providing seamless bar-aligned transitions, crossfades (0–12s), and automated tempo stretching.

---

## 4. Streaming & Music Provider Architecture

MUSICA operates a resilient, modular provider pipeline:

```
Track Request
      │
      ▼
InnerTubeXResolver (YouTube Music API)
      │
      ├─► Stream found & valid ─────────────► Feed to ExoPlayer
      │
      └─► Stream refused (403/410/PO-Token)
                │
                ▼
          NewPipeExtractor Fallback
                │
                ├─► Stream found ───────────► Feed to ExoPlayer
                │
                └─► High-Quality Fallback (JioSaavn 320kbps)
```

1. **InnerTube Client**: Primary client communicating directly with YouTube Music endpoints without requiring user sign-in.
2. **PO Token Generator**: Synthesizes YouTube Proof of Origin (PO) tokens via embedded JavaScript runtime to bypass bot detection.
3. **NewPipeExtractor**: Sits as an automatic fallback when InnerTube endpoints return 403 Forbidden or expired CDN URLs.
4. **JioSaavn Source**: Provides secondary audio fallback up to 320kbps AAC for regional Indian and international tracks.
5. **Spotify Importer**: Imports Spotify playlists and Liked Songs metadata, matching tracks against the streaming provider catalogue.

---

## 5. UI Architecture & Design System

- **Liquid Glass Navigation**: Custom Android 12+ runtime blur shader using `RenderEffect` and `liquidGlass` modifiers, folding seamlessly on scroll between expanded docked mini player and compact navigation pill.
- **Dynamic Backgrounds**: `AppWallpaperStore` supports pure black default (`DEFAULT_BLACK`), Mount Fuji, Anime Night, Cyberpunk Neon, Minimal Wave, and user custom wallpapers rendered behind translucent surfaces across all top-level destinations.
- **Dynamic App Icons**: `AppLogoManager` coordinates six selectable launcher icons (`Default`, `Black`, `Lavender`, `Mint Green`, `Sky Blue`, `Pink`) via Android `activity-alias` components in `AndroidManifest.xml`.
- **Word-Synced Lyrics**: Supports syllable-level karaoke highlighting from LRCLIB, KuGou, BiniLyrics, BetterLyrics, TTML, and YouTube Music. Built-in on-the-fly translation with timing projection.

---

## 6. Listening Statistics & Privacy

- Local device listening logger (`ListeningStats`):
  - Records play duration, skip rates, and completion percentages.
  - Aggregates stats into local monthly JSON buckets (`YYYY-MM.json`).
  - Calculates weekly, monthly, yearly, and lifetime listening hours, top 10 songs, most-played artists, and personalized listening rankings.
  - Zero external tracking: statistics never leave the user's device.
