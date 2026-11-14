# MUSICA Data Architecture & Persistence Specification

This document details how MUSICA stores, caches, and persists user data, listening history, audio streams, and application settings.

---

## 1. Local Storage Overview

MUSICA avoids centralized tracking and stores all sensitive user data locally on the device:

```
/data/user/0/com.music.bitchord/
├── shared_prefs/
│   ├── com.music.bitchord_preferences.xml  # Core settings & flags
│   ├── bitchord_auth.xml                   # Token credentials & auth sessions
│   ├── custom_wallpaper.xml                # Active background wallpaper state
│   └── app_logo.xml                        # Active launcher logo state
├── files/
│   ├── stats/                              # Listening statistics monthly buckets
│   │   ├── 2026-10.json
│   │   └── 2026-11.json
│   └── custom_covers/                      # User-imported playlist cover artwork
└── cache/
    ├── audio/                              # ExoPlayer SimpleCache for music tracks
    ├── discovery_video/                    # LRU cache for video discovery previews
    └── image_cache/                        # Coil3 image loading cache
```

---

## 2. Preference Storage (DataStore & SharedPreferences)

Application preferences are managed through `AppSettings.kt` with reactive `StateFlow` bindings:

| Preference Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `custom_wallpaper_id` | String | `default_black` | Current active background wallpaper identifier |
| `selected_app_logo` | String | `default` | Active launcher icon activity-alias choice |
| `mini_player_enabled` | Boolean | `true` | Controls visibility of docked/floating mini player |
| `liquid_glass` | Boolean | `false` | Enables backdrop blur & lens refraction on nav bar |
| `audio_quality_wifi` | String | `AUTO` | Streaming audio quality ceiling on Wi-Fi |
| `audio_quality_cellular` | String | `STANDARD`| Streaming audio quality ceiling on mobile data |
| `crossfade_duration_seconds` | Int | `0` | Audio crossfade duration between tracks (0–12s) |
| `swipe_to_play_next` | Boolean | `true` | Queue management swipe gesture in library lists |

---

## 3. Listening Statistics Engine

### 3.1 Aggregated Storage Strategy
Rather than maintaining an unbound event table containing every raw playback event, MUSICA aggregates playback time and play counts on-the-fly into calendar-month JSON buckets (`YYYY-MM.json`).

### 3.2 Schema Definition
```json
{
  "month": "2026-11",
  "totalListeningMs": 345600000,
  "dailyListeningMs": {
    "2026-11-01": 28400000,
    "2026-11-02": 31200000
  },
  "tracks": {
    "dQw4w9WgXcQ": {
      "title": "Never Gonna Give You Up",
      "artist": "Rick Astley",
      "playCount": 42,
      "totalDurationMs": 8946000,
      "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    }
  },
  "artists": {
    "Rick Astley": {
      "playCount": 42,
      "totalDurationMs": 8946000
    }
  }
}
```

### 3.3 Aggregation & Calculation
- **Weekly Stats**: Sum of daily stats for the preceding 7 calendar days.
- **Monthly Stats**: Aggregated directly from the active month's JSON file.
- **Yearly & Lifetime Stats**: Parallel merge pass over all stored monthly bucket files.
- **Top 10 Rankings**: Sorted by `totalDurationMs` and `playCount`.

---

## 4. Audio & Video Cache Subsystems

### 4.1 Media3 Audio Cache
- **Storage**: `cache/audio/`
- **Eviction Policy**: Least Recently Used (`LeastRecentlyUsedCacheEvictor`)
- **Default Limit**: 2 GB (configurable in Settings up to 10 GB)
- **Features**: Automatically holds chunked blocks of audio streams so previously played tracks replay instantly offline without consuming bandwidth.

### 4.2 Video Discovery Preview Cache
- **Storage**: `cache/discovery_video/`
- **Eviction Policy**: LRU with 64 MB cap
- **Features**: Dedicated exclusively to Stage 1 carousel 1-minute video clips, preventing video stream re-downloading during horizontal scrolling.
