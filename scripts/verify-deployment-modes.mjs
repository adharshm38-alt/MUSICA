/**
 * Verifies the production deployment adaptations, both when the server has
 * uploads enabled (development) and disabled (Render free tier).
 *
 * Checks:
 *   - GET /api/config exists, is public, and exposes booleans only
 *   - with uploads ON  : upload links are visible and /upload renders
 *   - with uploads OFF : upload links are hidden and /upload redirects away
 *   - YouTube search requires authentication either way
 *   - existing songs keep playing regardless of the upload setting
 *   - no secret is ever returned to the browser
 *
 * Run: node scripts/verify-deployment-modes.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const APP = 'http://127.0.0.1:5173/'
const API = 'http://localhost:5000/api'
const PORT = 9578
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

/** Restarts the API with a given UPLOADS_ENABLED value, detached. */
function startServer(uploadsEnabled) {
  const pidOut = spawnSync('bash', ['-c',
    `ss -lptnH 'sport = :5000' 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2`],
    { encoding: 'utf8' }).stdout.trim()
  if (pidOut) { try { process.kill(Number(pidOut), 'SIGKILL') } catch { /* already gone */ } }
  spawnSync('sleep', ['2'])
  const child = spawn('node', ['src/index.js'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, UPLOADS_ENABLED: uploadsEnabled },
    stdio: 'ignore',
    detached: true,
  })
  child.unref()
}

async function waitForApi(upToMs = 20000) {
  const deadline = Date.now() + upToMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${API}/config`)
      if (r.ok) return true
    } catch { /* not up yet */ }
    await sleep(500)
  }
  return false
}

// ---------------------------------------------------------------------------
console.log('='.repeat(66))
console.log('DEPLOYMENT MODE VERIFICATION')
console.log('='.repeat(66))

// ---- 1. /api/config contract ---------------------------------------------
console.log('\n=== 1. GET /api/config ===')
startServer('true')
check('server started with uploads ON', await waitForApi())

const cfgOn = await (await fetch(`${API}/config`)).json()
console.log('  ' + JSON.stringify(cfgOn))
check('is public and succeeds', cfgOn?.success === true)
check('uploadsEnabled is true by default in dev', cfgOn?.data?.uploadsEnabled === true)
check('youtubeEnabled is true with a key present', cfgOn?.data?.youtubeEnabled === true)
check('exposes only the two documented booleans',
  Object.keys(cfgOn?.data || {}).sort().join(',') === 'uploadsEnabled,youtubeEnabled',
  Object.keys(cfgOn?.data || {}).join(','))
check('response contains no key material',
  !JSON.stringify(cfgOn).includes('AIza') && !JSON.stringify(cfgOn).toLowerCase().includes('mongodb'))

// ---- 2. auth gating on YouTube search ------------------------------------
console.log('\n=== 2. YouTube search is auth-gated (quota protection) ===')
const anonSearch = await fetch(`${API}/youtube/search?q=test`)
check('anonymous /youtube/search is rejected', anonSearch.status === 401, `HTTP ${anonSearch.status}`)
const anonTrending = await fetch(`${API}/youtube/trending`)
check('anonymous /youtube/trending is rejected', anonTrending.status === 401, `HTTP ${anonTrending.status}`)
const pubStatus = await fetch(`${API}/youtube/status`)
check('/youtube/status stays public', pubStatus.status === 200, `HTTP ${pubStatus.status}`)

// ---- 3. uploads ON: UI shows upload affordances --------------------------
console.log('\n=== 3. Uploads ENABLED (development) ===')
startServer('true')
await waitForApi()

// login
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-deploy-'))
fs.writeFileSync(path.join(profileDir, 'user.js'), [
  'user_pref("media.autoplay.default", 0);',
  'user_pref("media.autoplay.blocking_policy", 0);',
  'user_pref("permissions.default.autoplay-granted", true);',
].join('\n'))
const ff = spawn('/usr/bin/firefox', ['--headless', '--profile', profileDir, '--no-remote',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port', String(PORT), APP],
  { stdio: ['ignore', 'ignore', 'pipe'] })
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
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.type === 'error' ? reject(new Error(m.message || m.error)) : resolve(m.result)
  }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
})
await send('session.new', { capabilities: {} })
const { contexts } = await send('browsingContext.getTree', {})
const context = contexts[0].context
const de = (v) => {
  if (!v) return v
  if (['string', 'number', 'boolean'].includes(v.type)) return v.value
  if (v.type === 'object') return Object.fromEntries((Array.isArray(v.value) ? v.value : []).map((p) => [p[0], de(p[1])]))
  if (v.type === 'array') return (v.value || []).map(de)
  return v.value
}
const ev = async (expression) => {
  const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' })
  return de(r?.result)
}

await send('browsingContext.navigate', { context, url: `${APP}login`, wait: 'complete' })
await sleep(4000)
await ev(`(() => { const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
  d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(document.querySelector('#email'),'nova@musica.dev');
  set(document.querySelector('#password'),'password123'); })()`)
await ev(`(() => { const f=document.querySelector('#password')?.closest('form');
  if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); })()`)
await sleep(5000)
check('logged in', Boolean(await ev(`localStorage.getItem('musica.token')`)))

await send('browsingContext.navigate', { context, url: `${APP}library`, wait: 'complete' })
await sleep(4000)
const ctaOn = await ev(`document.querySelectorAll('a[href="/upload"]').length`)
check('upload link is VISIBLE when uploads are enabled', ctaOn > 0, `links=${ctaOn}`)

await send('browsingContext.navigate', { context, url: `${APP}upload`, wait: 'complete' })
await sleep(4000)
const uploadPage = await ev(`document.body.innerText.includes('Upload') || document.querySelector('input[type="file"]') !== null`)
check('/upload renders when uploads are enabled', uploadPage === true)

// ---- 4. uploads OFF: UI hides them ---------------------------------------
console.log('\n=== 4. Uploads DISABLED (Render free tier) ===')
startServer('false')
check('server restarted with uploads OFF', await waitForApi())

const cfgOff = await (await fetch(`${API}/config`)).json()
console.log('  ' + JSON.stringify(cfgOff))
check('uploadsEnabled is false', cfgOff?.data?.uploadsEnabled === false)

// API must refuse, not just the UI
const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'nova@musica.dev', password: 'password123' }),
})
const tok = (await loginRes.json())?.data?.token
const postRes = await fetch(`${API}/songs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
  body: JSON.stringify({ title: 'x', artistName: 'y' }),
})
check('POST /songs is refused with 403', postRes.status === 403, `HTTP ${postRes.status}`)

const discover = await fetch(`${API}/songs/discover`)
check('existing songs are still readable', discover.status === 200, `HTTP ${discover.status}`)

await send('browsingContext.navigate', { context, url: `${APP}library`, wait: 'complete' })
await sleep(6000)
const offDiag = await ev(`(async () => {
  const links = [...document.querySelectorAll('a[href="/upload"]')];
  // Ask the server directly from inside the page, so we can tell an API problem
  // apart from a rendering problem.
  let cfg = null, err = null;
  try {
    const r = await fetch('http://localhost:5000/api/config');
    cfg = await r.json();
  } catch (e) { err = String(e); }
  return {
    count: links.length,
    html: links.map(l => l.outerHTML.slice(0, 90)),
    cfg, err,
    path: location.pathname,
  };
})()`)
console.log('  upload links on Library:', offDiag?.count, 'at', offDiag?.path)
console.log('  /api/config seen from the page:', JSON.stringify(offDiag?.cfg), offDiag?.err || '')
if (offDiag?.html?.length) console.log('  rendered:', offDiag.html[0])
check('upload link is HIDDEN when uploads are disabled', offDiag?.count === 0, `links=${offDiag?.count}`)
check('the page itself sees uploadsEnabled=false', offDiag?.cfg?.data?.uploadsEnabled === false,
  JSON.stringify(offDiag?.cfg?.data))

await send('browsingContext.navigate', { context, url: `${APP}upload`, wait: 'complete' })
await sleep(4500)
const redirected = await ev(`({ path: location.pathname, hasFile: document.querySelector('input[type="file"]') !== null })`)
console.log('  after visiting /upload:', JSON.stringify(redirected))
check('/upload redirects away when uploads are disabled', redirected?.path !== '/upload', 'path=' + redirected?.path)
check('no upload form is rendered', redirected?.hasFile === false)

// YouTube must be completely unaffected
const authedSearch = await fetch(`${API}/youtube/search?q=daft+punk&maxResults=1`, {
  headers: { Authorization: `Bearer ${tok}` },
})
check('YouTube search still works with uploads disabled', authedSearch.status === 200,
  `HTTP ${authedSearch.status}`)

ws.close(); ff.kill('SIGKILL'); fs.rmSync(profileDir, { recursive: true, force: true })

// restore dev default
startServer('true')
await waitForApi()

console.log('\n' + '='.repeat(66))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: DEPLOYMENT MODES VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(66))
process.exit(failed === 0 ? 0 : 1)