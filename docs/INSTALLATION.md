# MUSICA Installation & Sideloading Guide

MUSICA is distributed as a standalone Android package (`.apk`) directly via GitHub Releases. It does not require Google Play Services to stream or discover music.

---

## 1. System Requirements

- **Operating System**: Android 8.0 Oreo (API level 26) or newer.
- **Recommended**: Android 12 Snow Cone (API level 31) or newer for full Liquid Glass real-time shader blur and RenderEffect support.
- **Storage**: Minimum 200 MB free internal storage (more recommended for offline audio cache).
- **RAM**: Minimum 2 GB (4 GB+ recommended for seamless video discovery feeds).

---

## 2. Choosing the Right APK Architecture

GitHub Releases provide separate APKs optimized for specific hardware architectures, as well as a universal bundle:

| APK File | Recommended Devices | Characteristics |
| :--- | :--- | :--- |
| **`MUSICA-v1.0.0-arm64-v8a.apk`** | 95%+ of modern Android phones & tablets (Snapdragon, MediaTek, Tensor, Exynos 64-bit) | Smallest size (~144 MB), fastest execution, optimized 64-bit native DSP code |
| **`MUSICA-v1.0.0-armeabi-v7a.apk`** | Older 32-bit Android phones, budget tablets, or legacy smart TVs | 32-bit compatibility (~134 MB) |
| **`MUSICA-v1.0.0-x86_64.apk`** | Android emulators on PC, Intel/AMD Chromebooks, Android-x86 OS | High performance on x86_64 processors (~150 MB) |
| **`MUSICA-v1.0.0-universal.apk`** | Works on **any** supported Android device regardless of CPU | Contains native binaries for all 4 ABIs (~250 MB) |

> [!TIP]
> If you are unsure which CPU architecture your device uses, install **`arm64-v8a`** on any phone made after 2017, or use the **`universal`** build.

---

## 3. Sideloading Instructions

1. Download the preferred `.apk` file from the official [MUSICA Releases](https://github.com/adharshm38-alt/MUSICA/releases) page.
2. When prompted by your web browser, tap **Download anyway**.
3. Open your device's file manager or browser downloads and tap the downloaded `.apk`.
4. If Android displays: *"For your security, your phone is not allowed to install unknown apps from this source"*:
   - Tap **Settings**.
   - Enable **Allow from this source**.
   - Tap Back and press **Install**.
5. Once installation finishes, tap **Open** to launch MUSICA.

---

## 4. Permissions Explained

MUSICA requests only the minimum permissions necessary for music playback:

- **Notifications (`POST_NOTIFICATIONS`)**: Required on Android 13+ to display the system media notification with transport controls, album artwork, and seek bar.
- **Foreground Service (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`)**: Required to prevent Android from terminating audio playback when the app is minimized or the screen is locked.
- **Audio Focus & Bluetooth (`BLUETOOTH_CONNECT`)**: Required to route audio over wireless headphones and respond to headphone button taps.
- **Storage / Audio Files (`READ_MEDIA_AUDIO` / `READ_EXTERNAL_STORAGE`)**: Optional; only required if you use the Local Library feature to play songs stored on your device. Zero internet access is used for local files.
