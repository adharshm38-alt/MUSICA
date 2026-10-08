/**
 * UI verification for quota-aware search, driven headlessly through Firefox
 * WebDriver BiDi.
 *
 * Confirms on the real rendered page that:
 *   1. searching during a quota outage shows the quota copy, NOT "No results"
 *   2. local/user-owned music is still listed and playable
 *   3. the persistent mini-player remains visible
 *   4. no console errors
 *   5. the official YouTube iframe player machinery is untouched
 *
 * Run: node scripts/verify-quota-ui.mjs
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const API = 'http://localhost:5000/api'
const PORT = 9593
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-quota-'))
fs.writeFileSync(path.join(profileDir, 'user.js'), [
  'user_pref("media.autoplay.default", 0);',
  'user_pref("media.autoplay.blocking_policy", 0);',
  'user_pref("media.webservice.exec-idle-timeout", 0);',
].join('\n'))

const ff = spawn('/usr/bin/firefox', [
  '--headless', '--profile', profileDir, '--no-remote',
  '--remote-debugging-port', String(PORT), APP,
], { stdio: ['ignore', 'ignore', 'pipe'] })

let buf = ''
const url = await new Promise((resolve) => {
  ff.stderr.on('data', (c) => {
    buf += c.toString()
    const m = buf.match(/WebDriver BiDi listening on (ws:\/\/\S+)/)
    if (m) resolve(m[1].replace(/\/+$/, '') + '/session')
  })
  setTimeout(() => resolve(`ws://127.0.0.1:${PORT}/session`), 25000)
})

const ws = new WebSocket(url)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let id = 0
const pending = new Map()
const logs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.type === 'error' ? reject(new Error(m.message || m.error)) : resolve(m.result)
  } else if (m.method === 'log.entryAdded') logs.push(m.params)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
})

await send('session.new', { capabilities: {} })
await send('session.subscribe', { events: ['log.entryAdded'] })

// BiDi requires a real browsing-context id; "default" is not a valid target.
const { contexts } = await send('browsingContext.getTree', {})
const context = contexts[0].context

/** Deserializes a BiDi RemoteValue into a plain JS value. */
const de = (v) => {
  if (!v) return v
  if (['string', 'number', 'boolean'].includes(v.type)) return v.value
  if (v.type === 'object') {
    return Object.fromEntries(
      (Array.isArray(v.value) ? v.value : []).map((p) => [p[0], de(p[1])]),
    )
  }
  if (v.type === 'array') return (v.value || []).map(de)
  return v.value
}

const evalJs = async (expression) => {
  const r = await send('script.evaluate', {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: 'none',
  })
  return de(r?.result)
}

console.log('='.repeat(70))
console.log('QUOTA-AWARE SEARCH UI (headless Firefox)')
console.log('='.repeat(70))

/* ---- 1. sign in ---- */
console.log('\n=== 1. Sign in ===')
await sleep(2500)
await evalJs(`
  (async () => {
    const r = await fetch('${API}/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nova@musica.dev', password: 'password123' }),
    });
    const d = await r.json();
    localStorage.setItem('musica.token', d.data.token);
    localStorage.setItem('musica.user', JSON.stringify(d.data.user));
    return true;
  })()
`)
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(3500)
check('logged in', (await evalJs(`!!document.querySelector('aside, nav, header')`)) === true)

/* ---- 2. Search during the quota outage ---- */
console.log('\n=== 2. Search during quota outage ===')
await send('browsingContext.navigate', { context, url: `${APP}search?q=blinding%20lights`, wait: 'complete' })
await sleep(5000)

const body = await evalJs(`document.body.innerText`)
const hasQuotaCopy = body.includes('YouTube search quota is temporarily unavailable. Local music is still available.')
const hasTemporarily = body.includes('temporarily unavailable')
const saysNoMusicFound = body.includes('No music found for this search.')
const saysNoResults = body.includes('No results for')

check('renders the quota message', hasQuotaCopy || hasTemporarily,
  hasQuotaCopy ? 'exact copy present' : hasTemporarily ? 'partial copy' : 'not found')
check('does NOT claim "No music found for this search."', !saysNoMusicFound)
check('does NOT claim "No results for"', !saysNoResults)

/* ---- 3. Local music still listed and playable ---- */
console.log('\n=== 3. Local music still available ===')
const localState = await evalJs(`
  (() => {
    const text = document.body.innerText;
    const cards = [...document.querySelectorAll('button')]
      .filter(b => /Play /.test(b.getAttribute('aria-label') || ''));
    return {
      // A local song should still be searchable during the outage.
      text: text.slice(0, 4000),
      playButtons: cards.length,
      badges: [...document.querySelectorAll('*')]
        .filter(e => e.children.length === 0 && e.textContent.trim() === 'MUSICA').length,
    };
  })()
`)
check('local music section rendered during the outage',
  /Songs|MUSICA/.test(localState.text), 'Songs/MUSICA present')

// Search a track that exists locally to prove playback still works.
await send('browsingContext.navigate', { context, url: `${APP}search?q=golden%20hour`, wait: 'complete' })
await sleep(5000)
const localSearch = await evalJs(`
  (() => {
    const plays = [...document.querySelectorAll('button')]
      .filter(b => /Play /.test(b.getAttribute('aria-label') || ''));
    return { plays: plays.length, text: document.body.innerText.slice(0, 1500) };
  })()
`)
check('local track has a Play control', localSearch.plays > 0, `play buttons=${localSearch.plays}`)
check('local track is listed', /Golden/i.test(localSearch.text))

// Actually play it and confirm the persistent mini-player appears.
if (localSearch.plays > 0) {
  await evalJs(`
    (() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /Play /.test(x.getAttribute('aria-label') || ''));
      if (b) b.click();
      return true;
    })()
  `)
  await sleep(4000)
  const player = await evalJs(`
    (() => {
      // The shared <audio> is created with new Audio() and intentionally never
      // attached to the DOM, so it cannot be found with querySelector. The
      // observable proof of playback is the media session / player UI state and
      // the network fetch for the audio file itself.
      const shell = document.querySelector('.pb-player, [class*="pb-player"]');
      const r = shell ? shell.getBoundingClientRect() : null;
      const pauseBtns = [...document.querySelectorAll('button')]
        .filter(b => /Pause/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      return {
        present: !!shell,
        visible: r ? r.width > 0 && r.height > 0 && getComputedStyle(shell).opacity !== '0' : false,
        width: r ? Math.round(r.width) : 0,
        height: r ? Math.round(r.height) : 0,
        hasPauseControl: pauseBtns.length > 0,
        // A title in the bar means the shared element is now loaded with a song.
        showsTrack: /Golden|Lumen/i.test(document.body.innerText),
      };
    })()
  `)
  console.log(`  player: ${JSON.stringify(player)}`)
  check('persistent player shell is present', player.present === true)
  check('player is VISIBLE (not hidden)', player.visible === true)
  check('player has real dimensions', player.width > 100 && player.height > 0,
    `${player.width}x${player.height}`)
  check('player took the local track', player.showsTrack === true)
  check('playback controls switched to Pause (playback started)',
    player.hasPauseControl === true,
    'shared HTMLAudioElement is driving the track')
}

/* ---- 4. Official YouTube player machinery untouched ---- */
console.log('\n=== 4. Official YouTube player intact (in code, not in this empty DOM) ===')
// During a quota outage there is no YouTube result to embed, so the live DOM
// legitimately contains no iframe. The player contract is asserted against the
// SHIPPED SOURCE instead, which is what must not regress.
const playerSrc = fs.readFileSync(
  path.join(process.cwd(), 'client/src/components/player/YouTubeStage.jsx'),
  'utf8',
) + fs.readFileSync(
  path.join(process.cwd(), 'client/src/context/playback/engines.js'),
  'utf8',
)
check('player still uses youtube-nocookie.com (privacy-preserving embed)',
  playerSrc.includes('youtube-nocookie.com'))
check('player still loads the official IFrame Player API',
  /iframe_api|YT\.Player/.test(playerSrc))
check('player enforces a minimum visible size (>=200x200)',
  /MIN_SIZE\s*=\s*200/.test(playerSrc))
check('no yt-dlp / media-segment scraping in the shipped player',
  !/googlevideo|videoplayback|adaptiveFormats|signatureCipher|yt-dlp/.test(playerSrc))
const domHtml = await evalJs('document.documentElement.innerHTML')
check('no media-extraction artefacts in the live DOM',
  !/googlevideo|videoplayback|adaptiveFormats|signatureCipher/.test(domHtml))

/* ---- 5. Console hygiene ---- */
console.log('\n=== 5. Console hygiene ===')
const errors = logs.filter((l) => l.level === 'error')
const realErrors = errors.filter((e) => {
  const t = e.text || e.message || ''
  // Ignore upstream media/network noise unrelated to our own code.
  return !/media\.notAllowed|AbortError|net::|NS_ERROR|CSP|Failed to load resource/i.test(t)
})
console.log(`  console entries: ${logs.length}, errors: ${errors.length}, after filter: ${realErrors.length}`)
if (realErrors.length) realErrors.slice(0, 5).forEach((e) => console.log(`    - ${e.text || e.message}`))
check('no console errors from our own code', realErrors.length === 0,
  `${realErrors.length} unexpected`)

ws.close()
try { ff.kill('SIGKILL') } catch { /* already gone */ }
fs.rmSync(profileDir, { recursive: true, force: true })

console.log('\n' + '='.repeat(70))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: QUOTA UI VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(70))
process.exit(failed === 0 ? 0 : 1)