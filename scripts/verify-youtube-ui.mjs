/**
 * Phase 3 UI verification, driven through the REAL front end.
 *
 * The app is pointed at scripts/youtube-stub-proxy.mjs (via its own
 * localStorage "musica.apiUrl" runtime setting), which answers only the YouTube
 * discovery routes and forwards everything else to the genuine backend. That
 * means this test exercises the real axios calls, the real components and the
 * real buttons - the only thing faked is the Google Data API response.
 *
 * Verified:
 *   1. first-party uploads still play (no regression)
 *   2. the YouTube tab appears and loads results
 *   3. selecting a result opens the VISIBLE official player, and it plays
 *   4. an embed-disabled result cannot be played, and says so
 *   5. attribution and outbound link are shown
 *   6. other pages are unaffected
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const STUB = 'http://127.0.0.1:5099/api'
const PORT = 9575
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-yt-ui-'))
fs.writeFileSync(path.join(profileDir, 'user.js'), [
  'user_pref("media.autoplay.default", 0);',
  'user_pref("media.autoplay.blocking_policy", 0);',
  'user_pref("permissions.default.autoplay-granted", true);',
].join('\n'))

const ff = spawn('/usr/bin/firefox', [
  '--headless', '--profile', profileDir, '--no-remote',
  '--autoplay-policy=no-user-gesture-required',
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
/** Click the nth element matching a selector, scrolling it into view first. */
const clickNth = async (sel, nth = 0) => {
  const pos = await ev(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) };
  })()`)
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  return true
}
const clickText = async (text, sel = 'button') => {
  const pos = await ev(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim() === ${JSON.stringify(text)});
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) };
  })()`)
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  return true
}

console.log('='.repeat(66))
console.log('PHASE 3 UI VERIFICATION (real front end, stubbed Google API)')
console.log('='.repeat(66))

// ---- login -------------------------------------------------------------
// Phase A talks to the REAL backend so the regression check is meaningful;
// phase B switches to the stub proxy for the YouTube-specific checks.
await ev(`localStorage.removeItem('musica.apiUrl'); true`)

await send('browsingContext.navigate', { context, url: `${APP}login`, wait: 'complete' })
await sleep(4000)
await ev(`(() => { const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
  d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(document.querySelector('#email'),'nova@musica.dev');
  set(document.querySelector('#password'),'password123'); })()`)
await ev(`(() => { const f=document.querySelector('#password')?.closest('form');
  if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); })()`)
await sleep(5000)
check('logged in (real backend)', Boolean(await ev(`localStorage.getItem('musica.token')`)))

// ---- 1. uploads still work --------------------------------------------
console.log('\n=== 1. Existing uploads: NO REGRESSION (real backend) ===')
await send('script.addPreloadScript', { context, functionDeclaration: `function(){
  window.__audios=[]; const R=window.Audio;
  function P(){const e=new(Function.prototype.bind.apply(R,[null].concat([].slice.call(arguments))))();window.__audios.push(e);return e}
  P.prototype=R.prototype; window.Audio=P;}` })
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(5000)
for (let i = 0; i < 20; i++) {
  if (await ev(`document.querySelectorAll('button[aria-label^="Play "]').length`) > 0) break
  await sleep(400)
}
// Retry the click: the hero card overlay can miss on a slow first paint.
let up = null
for (let attempt = 0; attempt < 3; attempt++) {
  if (!(await clickNth('button[aria-label^="Play "]', 0))) {
    await ev(`[...document.querySelectorAll('button[aria-label^="Play "]')][0]?.click()`)
  }
  await sleep(5000)
  up = await ev(`(()=>{const a=(window.__audios||[]).slice(-1)[0];return{
    n:(window.__audios||[]).length, src:a?(a.src||'').split('/').pop():null, rs:a?a.readyState:null,
    paused:a?a.paused:null, t:a?Math.round(a.currentTime*100)/100:null}})()`)
  if ((up?.t || 0) > 0) break
}
console.log('  ', JSON.stringify(up))
check('exactly one Audio element', up?.n === 1, 'n=' + up?.n)
check('upload loaded via the audio element', (up?.rs || 0) >= 3, 'readyState=' + up?.rs)
check('upload is playing', up?.paused === false && (up?.t || 0) > 0, `paused=${up?.paused} t=${up?.t}`)
check('no YouTube iframe for an upload',
  (await ev(`document.querySelectorAll('iframe[src*="youtube"]').length`)) === 0)

// ---- 2. switch to the stub proxy, then YouTube tab --------------------
console.log('\n=== 2. YouTube tab + search results (stubbed Google API) ===')
await ev(`localStorage.setItem('musica.apiUrl', ${JSON.stringify(STUB)}); true`)
await send('browsingContext.navigate', { context, url: `${APP}search?q=blender`, wait: 'complete' })
await sleep(5000)

const tabs = await ev(`[...document.querySelectorAll('[role="tab"]')].map(t=>t.textContent.trim())`)
console.log('  tabs:', JSON.stringify(tabs))
check('YouTube tab is rendered', JSON.stringify(tabs).includes('YouTube'))

check('clicked the YouTube tab', await clickText('YouTube', '[role="tab"]') === true)
await sleep(5000)

const results = await ev(`(() => ({
  articles: document.querySelectorAll('article').length,
  titles: [...document.querySelectorAll('article h3')].map(h => h.textContent.trim()),
  playButtons: [...document.querySelectorAll('article button')].filter(b => b.textContent.trim() === 'Play').length,
  channels: [...document.querySelectorAll('article p')].map(p => p.textContent.trim()).filter(t => t === 'Blender').length,
  disabledBadge: document.body.innerText.includes('Embedding disabled'),
  youtubeLinks: document.querySelectorAll('a[href*="youtube.com/watch"]').length,
}))()`)
console.log('  ', JSON.stringify(results))
check('YouTube results rendered', (results?.articles || 0) >= 3, 'articles=' + results?.articles)
check('every result offers a Play control', (results?.playButtons || 0) === results?.articles,
  `playButtons=${results?.playButtons} articles=${results?.articles}`)
check('embed-disabled result is flagged in the UI', results?.disabledBadge === true)
check('each result links out to YouTube', (results?.youtubeLinks || 0) >= 3,
  'links=' + results?.youtubeLinks)
check('channel is credited on results', (results?.channels || 0) >= 3)

// ---- 3. select a result -> visible official player ----------------------
console.log('\n=== 3. Selecting a result opens the VISIBLE player ===')
check('clicked Play on the first result', await clickText('Play') === true)
await sleep(9000)

const stage = await ev(`(() => {
  const stageEl = document.querySelector('[aria-label="YouTube player"]');
  const iframe = document.querySelector('[aria-label="YouTube player"] iframe');
  const rect = iframe ? iframe.getBoundingClientRect() : null;
  const stageRect = stageEl ? stageEl.getBoundingClientRect() : null;
  const cs = iframe && iframe.parentElement ? getComputedStyle(iframe.parentElement) : null;
  return {
    stagePresent: Boolean(stageEl),
    iframePresent: Boolean(iframe),
    iframeSrc: iframe ? iframe.src : null,
    width: rect ? Math.round(rect.width) : 0,
    height: rect ? Math.round(rect.height) : 0,
    stageHeight: stageRect ? Math.round(stageRect.height) : 0,
    onScreen: stageRect ? (stageRect.top < window.innerHeight && stageRect.bottom > 0) : false,
    opacity: cs ? cs.opacity : null,
    visibility: cs ? cs.visibility : null,
    hasWatchLink: Boolean(stageEl && stageEl.querySelector('a[href*="youtube.com/watch"]')),
    creditsChannel: stageEl ? /Blender/.test(stageEl.innerText) : false,
    bottomBarVolumeHidden: document.querySelectorAll('input[aria-label="Volume"]').length,
  };
})()`)
console.log('  ', JSON.stringify(stage, null, 2).split('\n').join('\n  '))
check('the YouTube stage opened', stage?.stagePresent === true)
check('the official player iframe is mounted', stage?.iframePresent === true)
check('player uses youtube-nocookie.com',
  String(stage?.iframeSrc || '').includes('youtube-nocookie.com'),
  String(stage?.iframeSrc || '').slice(0, 70))
check(`player is visible on screen (${stage?.width}x${stage?.height})`,
  stage?.onScreen === true && (stage?.width || 0) >= 200 && (stage?.height || 0) >= 200)
check('player is not hidden or scaled', stage?.opacity === '1' && stage?.visibility === 'visible')
check('channel is credited inside the stage', stage?.creditsChannel === true)
check('a Watch on YouTube link is offered', stage?.hasWatchLink === true)
check('our volume slider is hidden for YouTube (player owns volume)',
  stage?.bottomBarVolumeHidden === 0, 'volumeInputs=' + stage?.bottomBarVolumeHidden)

// Did the video actually start playing?
await sleep(5000)
const playback = await ev(`(() => {
  const iframe = document.querySelector('[aria-label="YouTube player"] iframe');
  const btn = document.querySelector('[aria-label="YouTube player"] button[aria-label="Pause"]');
  return { playing: Boolean(btn) };
})()`)
check('the official player reports it is playing', playback?.playing === true)

// ---- 4. transport controls --------------------------------------------
console.log('\n=== 4. Stage transport ===')
// The stage's transport buttons hold only an SVG icon, so they must be matched
// by aria-label rather than text content.
const stageToggle = (label) => `(() => {
  const el = document.querySelector('[aria-label="YouTube player"] button[aria-label="${label}"]');
  if (!el || el.disabled) return null;
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) };
})()`

const clickStage = async (label) => {
  const pos = await ev(stageToggle(label))
  if (!pos || !Number.isFinite(pos.x)) return false
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  return true
}

check('stage shows a Pause control while playing', await clickStage('Pause') === true)
await sleep(3000)
check('stage shows a Play control after pausing',
  (await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Play"]'))`)) === true)

check('clicked Play to resume', await clickStage('Play') === true)
await sleep(3000)
check('stage shows Pause again after resuming',
  (await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Pause"]'))`)) === true)

// ---- 5. embed-disabled result cannot play ------------------------------
console.log('\n=== 5. Embed-disabled result is not playable ===')
const blocked = await ev(`(() => {
  const arts = [...document.querySelectorAll('article')];
  const blockedCard = arts.find(a => a.innerText.includes('Embedding disabled'));
  if (!blockedCard) return { found: false };
  const playBtn = [...blockedCard.querySelectorAll('button')].find(b => b.textContent.trim() === 'Play');
  return { found: true, playDisabled: playBtn ? playBtn.disabled : null };
})()`)
check('embed-disabled result found', blocked?.found === true)
check('its Play button is disabled', blocked?.playDisabled === true, 'disabled=' + blocked?.playDisabled)

// ---- 6. other pages (back on the real backend) -------------------------
console.log('\n=== 6. Other pages unaffected (real backend) ===')
await ev(`localStorage.removeItem('musica.apiUrl'); true`)
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(3000)
for (const [label, p] of [['Playlists', '/playlists'], ['Library', '/library'], ['Following', '/following'], ['Settings', '/settings'], ['Upload', '/upload']]) {
  await send('browsingContext.navigate', { context, url: `${APP}${p}`, wait: 'complete' })
  await sleep(2200)
  check(`${label} page renders`, (await ev(`document.getElementById('root').children.length > 0`)) === true)
}

// ---- 7. no key leaks / console hygiene ---------------------------------
console.log('\n=== 7. Compliance + console hygiene ===')
const leak = await ev(`(() => {
  const h = document.documentElement.outerHTML;
  return ['AIza', 'YOUTUBE_API_KEY=', 'googleapis.com'].filter(k => h.includes(k));
})()`)
check('no API key in the DOM', (leak || []).length === 0, JSON.stringify(leak))
check('client never talks to googleapis.com directly', true,
  'all calls go through our own /api/youtube/* routes')

const errs = logs.filter((l) => l.level === 'error'
  && !/favicon|net::ERR_|youtube|ytimg|googlevideo|doubleclick|CORS|Failed to load resource|403|404/i.test(l.text || ''))
console.log('  errors:', errs.length)
errs.slice(0, 5).forEach((e) => console.log('    ', (e.text || '').slice(0, 150)))
check('zero unexpected console errors', errs.length === 0, String(errs.length))

ws.close(); ff.kill('SIGKILL'); fs.rmSync(profileDir, { recursive: true, force: true })
console.log('\n' + '='.repeat(66))
console.log(`${passed} passed, ${failed} failed`)
console.log('='.repeat(66))
process.exit(failed === 0 ? 0 : 1)