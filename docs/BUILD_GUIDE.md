# MUSICA Build & Development Guide

This guide describes how to set up your local environment and build all MUSICA modules (Android App, Android TV, Wear OS, and the Go Party Backend) from source.

---

## 1. Prerequisites

- **Java Development Kit (JDK)**: OpenJDK 17 (Temurin recommended).
- **Android SDK**:
  - `compileSdkVersion`: **37** (required for InnerTubeX AAR)
  - `targetSdkVersion`: **36**
  - `minSdkVersion`: **26** (Android 8.0 Oreo)
  - `Build-Tools`: `35.0.0` or newer
- **Android NDK & CMake**:
  - `ndkVersion`: `26.1.10909125`
  - `CMake`: `3.22.1` or newer
- **Go**: Version `1.22+` (required only for building `backend/`)
- **Node.js**: Version `20+` (required only for `backend/server.js`)

Set your environment variables in your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
```

---

## 2. Repository Configuration

Clone the repository and set up configuration files:

```bash
git clone https://github.com/adharshm38-alt/MUSICA.git
cd MUSICA
```

Create `local.properties` in the root folder:

```properties
sdk.dir=/path/to/your/Android/Sdk
LASTFM_API_KEY=
LASTFM_SECRET=
LISTEN_TOGETHER_SERVER=https://musica-jam.onrender.com
PROTON_AUTH_SERVER=http://127.0.0.1:3001
```

> [!NOTE]
> All credentials above are optional. If left blank, MUSICA builds cleanly with default public fallback endpoints.

---

## 3. Building the Android Application

### Debug APK Build (Immediate testing)
```bash
./gradlew :app:assembleProdDebug
```
Output directory: `app/build/outputs/apk/prod/debug/`
- `app-prod-universal-debug.apk`
- `app-prod-arm64-v8a-debug.apk`
- `app-prod-armeabi-v7a-debug.apk`
- `app-prod-x86_64-debug.apk`
- `app-prod-x86-debug.apk`

### Signed Release APK Build
To create a signed release APK, configure `keystore.properties` in the project root:

```properties
storeFile=musica-release.jks
storePassword=your_keystore_password
keyAlias=your_key_alias
keyPassword=your_key_password
```

Run:
```bash
./gradlew :app:assembleProdRelease
```
Output directory: `app/build/outputs/apk/prod/release/`

---

## 4. Building Submodules

### 4.1 Android TV
```bash
./gradlew :tv:assembleProdDebug
```
Output: `tv/build/outputs/apk/prod/debug/`

### 4.2 Wear OS Watch App
```bash
./gradlew :wearos:assembleProdDebug
```
Output: `wearos/build/outputs/apk/prod/debug/`

---

## 5. Building the Backend Services

### 5.1 Go Listen Together Server
```bash
cd backend
go build -o server .
./server
```
Run tests:
```bash
go test -v ./...
```

### 5.2 Node.js Proton Mail Auth Server
```bash
cd backend
npm install
npm test
node server.js
```

---

## 6. Running Unit & Integration Tests

```bash
# Run shared common and JVM unit tests
./gradlew :shared:jvmTest

# Run Android app unit tests
./gradlew :app:testProdDebugUnitTest
```
