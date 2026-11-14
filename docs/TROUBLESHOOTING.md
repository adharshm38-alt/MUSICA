# MUSICA Troubleshooting Guide

This document lists solutions for common build, runtime, playback, and network issues encountered when developing or using MUSICA.

---

## 1. Playback & Streaming Issues

### Problem: Song fails to start or shows infinite buffering
- **Cause 1**: YouTube Music may temporarily rate-limit an IP or reject clients without a valid Proof of Origin (PO) token.
  - **Solution**: The app automatically falls back to `NewPipeExtractor` and `JioSaavn`. In **Settings → Audio & Playback**, toggle **Force Primary Extractor** or clear the audio cache in **Settings → Storage → Clear Audio Cache**.
- **Cause 2**: High network latency on mobile networks.
  - **Solution**: In **Settings → Audio Quality (Cellular)**, select **Standard (128 kbps)** instead of High or Lossless to reduce initial buffering payload.

### Problem: Playback terminates when screen is locked or app is minimized
- **Cause**: Aggressive OEM battery management (common on Xiaomi, OnePlus, Samsung, and Huawei devices) killing background media services.
  - **Solution**:
    1. Go to your phone's **Settings → Apps → MUSICA**.
    2. Tap **Battery** or **App battery usage**.
    3. Change from **Optimized** to **Unrestricted**.
    4. Ensure **Allow background activity** is checked.

### Problem: Audio interruptions or pauses during playback
- **Cause**: Audio focus loss triggered by another application (navigation app, message notifications, camera shutter).
  - **Solution**: In **Settings → Audio Focus**, enable **Duck audio during notifications** instead of pausing.

---

## 2. Video Discovery & Preview Issues

### Problem: Video preview cards in Home carousel do not show moving video
- **Cause 1**: Carousel is scrolled past the 55% visibility threshold.
  - **Solution**: The preview pool deliberately pauses when scrolling or when < 55% visible to eliminate frame drops and conserve GPU/battery. Center the card on screen.
- **Cause 2**: Device video decoder limits reached.
  - **Solution**: MUSICA enforces a strict **single-slot preview decoder pool** (`DiscoveryPreviewPool`). It automatically releases hardware codecs when leaving the screen.

### Problem: Video preview audio is muted
- **Cause**: Previews start in silent mode by design to prevent blasting audio while you browse the Home tab.
  - **Solution**: Tap the **Speaker / Mute icon** at the top-left corner of the active video card to enable preview sound.

---

## 3. UI & Theming Issues

### Problem: Custom wallpaper only displays in gallery thumbnails, not screen background
- **Cause**: Selected wallpaper ID was not applied to the root container.
  - **Solution**: Handled in MUSICA 1.0.0 via `AppBackgroundWallpaper` integration. Open **Settings → Extra Changes → Backgrounds**, select your wallpaper, and tap **Apply**. Pure black is restored anytime by picking **Default Black**.

### Problem: App launcher icon does not change on home screen
- **Cause**: Some third-party Android launchers (e.g., Nova Launcher, Samsung One UI) cache app icons aggressively.
  - **Solution**:
    1. After selecting an icon in **Settings → Extra Changes → App Logos**, restart your third-party launcher or wait 5–10 seconds.
    2. Ensure the app has not been moved to an external SD card, which can interfere with `activity-alias` components.

---

## 4. Build & Compilation Issues

### Problem: `No Android SDK found — building the desktop targets only.`
- **Cause**: Android SDK environment variable is not exported in the shell.
  - **Solution**: Add `export ANDROID_HOME=$HOME/Android/Sdk` to your `~/.bashrc` and restart terminal, or populate `sdk.dir` in `local.properties`.

### Problem: `[CXX5304] Observed package id 'platforms;android-37.0' in inconsistent location`
- **Cause**: Harmless AGP / CMake warning when building with compileSdk 37.
  - **Solution**: Ignore; this does not stop compilation and completes with `BUILD SUCCESSFUL`.

### Problem: `INSTALL_FAILED_UPDATE_INCOMPATIBLE` during `adb install`
- **Cause**: Sideloading over an existing installation signed with a different debug or release key.
  - **Solution**: Uninstall the older build first (`adb uninstall com.music.bitchord`) before installing the new build.
