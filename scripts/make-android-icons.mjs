// Generates MUSICA Android launcher icons (PNG, all densities) from the same
// brand gradient used by the web app, plus an adaptive-icon foreground.
// Run: source ~/.android-env.sh && node scripts/make-android-icons.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const RES = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../client/android/app/src/main/res',
)

// Densities Capacitor ships by default.
const DENSITIES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
}

// Adaptive foreground layers are 108dp with the logo in the middle 72dp.
const FOREGROUND_DENSITIES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
}

// --- minimal PNG writer (truecolour, no alpha) ----------------------------
let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- brand gradient: violet -> pink -> blue (matches the web app) -----------
function brandColor(x, y, size) {
  const t = (x / size) * 0.6 + (y / size) * 0.4 // diagonal blend
  const stops = [
    [0.0, [139, 92, 246]], // brand-500 violet
    [0.5, [236, 72, 153]], // accent pink
    [1.0, [59, 130, 246]], // accent blue
  ]
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [p0, c0] = stops[i]
    const [p1, c1] = stops[i + 1]
    if (t >= p0 && t <= p1) {
      const k = (t - p0) / (p1 - p0)
      return [0, 1, 2].map((i2) => Math.round(c0[i2] + (c1[i2] - c0[i2]) * k))
    }
  }
  return stops[stops.length - 1][1]
}

/**
 * Renders one icon: gradient background plus a white music note.
 * `paddingRatio` > 0 shrinks the artwork (used for adaptive foregrounds).
 */
function renderIcon(size, { transparentBg = false, paddingRatio = 0 } = {}) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const pad = size * paddingRatio
  const inner = size - pad * 2
  const stroke = Math.max(2, Math.round(size * 0.075))
  const radius = inner * 0.09

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 3 + 1)
    raw[rowStart] = 0 // PNG filter: none
    for (let x = 0; x < size; x += 1) {
      const i = rowStart + 1 + x * 3

      const lx = x - pad
      const ly = y - pad
      const inside = lx >= 0 && ly >= 0 && lx < inner && ly < inner

      if (!inside) {
        if (transparentBg) {
          // Adaptive foregrounds: opaque black is treated as transparent by
          // Android when the layer type is "alpha", so we use flat magenta-free
          // black here and rely on the layer type instead.
          raw[i] = 0
          raw[i + 1] = 0
          raw[i + 2] = 0
        } else {
          raw[i] = 0
          raw[i + 1] = 0
          raw[i + 2] = 0
        }
        continue
      }

      // Rounded-square mask so the legacy icon looks right on old launchers.
      const cx = Math.min(Math.max(lx, radius), inner - radius)
      const cy = Math.min(Math.max(ly, radius), inner - radius)
      const inCorner = (lx < radius || lx > inner - radius) && (ly < radius || ly > inner - radius)
      const cornerDist = Math.hypot(lx - cx, ly - cy)
      if (inCorner && cornerDist > radius) {
        raw[i] = 0
        raw[i + 1] = 0
        raw[i + 2] = 0
        continue
      }

      const bg = brandColor(lx, ly, inner)

      // ---- music note geometry (two stems + beam + two heads) ----
      const noteW = inner * 0.46
      const noteH = inner * 0.44
      const nx = (inner - noteW) / 2
      const ny = (inner - noteH) / 2
      const headR = noteH * 0.17
      const leftStemX = nx + headR * 1.1
      const rightStemX = nx + noteW - headR * 0.7
      const topY = ny
      const beamY = ny + headR * 0.55
      const beamH = noteH * 0.17

      const inStemL = Math.abs(lx - leftStemX) <= stroke / 2 && ly >= beamY && ly <= ny + noteH * 0.62
      const inStemR = Math.abs(lx - rightStemX) <= stroke / 2 && ly >= topY && ly <= ny + noteH * 0.62
      const inBeam = ly >= topY && ly <= topY + beamH && lx >= leftStemX - stroke / 2 && lx <= rightStemX + stroke / 2

      const headLY = ny + noteH * 0.62
      const headRX = rightStemX
      const dL = Math.hypot(lx - leftStemX, ly - headLY)
      const dR = Math.hypot(lx - headRX, ly - headLY)
      const inHeadL = dL <= headR
      const inHeadR = dR <= headR

      const onNote = inStemL || inStemR || inBeam || inHeadL || inHeadR

      if (onNote) {
        raw[i] = 255
        raw[i + 1] = 255
        raw[i + 2] = 255
      } else {
        raw[i] = bg[0]
        raw[i + 1] = bg[1]
        raw[i + 2] = bg[2]
      }
    }
  }
  return encodePng(size, size, raw)
}

// ---- write legacy launcher icons -----------------------------------------
for (const [dir, size] of Object.entries(DENSITIES)) {
  const out = path.join(RES, dir)
  fs.mkdirSync(out, { recursive: true })
  const png = renderIcon(size)
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    fs.writeFileSync(path.join(out, name), png)
  }
  console.log(`  ${dir}: ${size}x${size}`)
}

// ---- adaptive foreground: larger canvas, logo inside the safe zone --------
for (const [dir, size] of Object.entries(FOREGROUND_DENSITIES)) {
  const out = path.join(RES, dir)
  fs.mkdirSync(out, { recursive: true })
  // 1/6 padding on each side keeps the logo inside the 72dp safe zone.
  fs.writeFileSync(path.join(out, 'ic_launcher_foreground.png'), renderIcon(size, { paddingRatio: 1 / 6 }))
}

// ---- adaptive background: flat brand gradient ----------------------------
fs.writeFileSync(
  path.join(RES, 'drawable', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-android-icons.mjs - MUSICA brand gradient. -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:startColor="#8B5CF6"
        android:centerColor="#EC4899"
        android:endColor="#3B82F6"
        android:angle="315" />
</shape>
`,
)
console.log('  drawable/ic_launcher_background.xml (gradient)')

console.log('\nMUSICA launcher icons generated.')
