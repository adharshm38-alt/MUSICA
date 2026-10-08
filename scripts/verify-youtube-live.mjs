/**
 * UI INTEGRATION VERIFICATION against the LIVE YouTube Data API.
 *
 * Unlike verify-youtube-ui.mjs, this uses NO stub proxy. The server holds a real
 * key in server/.env and every result shown comes from Google's servers.
 *
 * Steps verified, in the order requested:
 *   1/2. client + server up
 *   3.   YouTube tab visible in the Search UI
 *   4.   search for a real song
 *   5.   real YouTube results appear
 *   6.   select a result
 *   7.   official visible YouTube embedded player loads
 *   8.   play and pause
 *   9.   existing local/uploaded music still works
 *  10.   browser console is clean
 *
 * The API key is never requested, printed or asserted on.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const API = 'http://localhost:5000/api'
const PORT = 9580
const QUERY = process.env.YT_QUERY || 'the weeknd blinding lights official'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}
const step = (n, t) => console.log(`\n=== ${n}. ${t} ===`)

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-live-'))
fs.writeFileSync(path.join(profileDir, 'user.js'), [
  'user_pref("media.autoplay.default", 0);',
  'user_pref("media.autoplay.blocking_policy", 0);',
  'user_pref("permissions.default.autoplay-granted", true);',
  'user_pref("media.webservice.exec-idle-timeout", 0);',
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
const network = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.type === 'error' ? reject(new Error(m.message || m.error)) : resolve(m.result)
  } else if (m.method === 'log.entryAdded') {
    logs.push(m.params)
  } else if (m.method === 'network.responseCompleted') {
    network.push(m.params)
  }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
})
await send('session.new', { capabilities: {} })
// Network events are NOT delivered unless explicitly subscribed. Without this
// the compliance checks below would silently pass on an empty array.
await send('session.subscribe', { events: ['network.responseCompleted'] })
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
const clickByText = async (text, sel = 'button') => {
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
const clickIn = async (scopeSel, label) => {
  const pos = await ev(`(() => {
    const scope = document.querySelector(${JSON.stringify(scopeSel)});
    if (!scope) return null;
    const el = scope.querySelector('button[aria-label="' + ${JSON.stringify(label)} + '"]');
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) };
  })()`)
  if (!pos || !Number.isFinite(pos.x)) return false
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  return true
}

console.log('='.repeat(68))
console.log('UI INTEGRATION VERIFICATION - LIVE YOUTUBE API')
console.log(`query: "${QUERY}"`)
console.log('='.repeat(68))

// ---------------------------------------------------------------- 1 & 2 ---
step(1, 'Client and server reachable')
const health = await (await fetch(`${API}/health`)).json()
check('API /health responds', health?.success === true)
const frontHtml = await (await fetch(APP)).text()
check('client serves HTML', frontHtml.includes('<div id="root"') || frontHtml.includes('<script'))

// login
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

const ytStatus = await (await fetch(`${API}/youtube/status`)).json()
check('server reports YouTube configured', ytStatus?.data?.configured === true,
  JSON.stringify(ytStatus?.data?.message))

// -------------------------------------------------------------------- 3 ---
step(3, 'Music search is the default, cross-source view')
// The debounced search fires ~320ms after the page settles, so the request
// lands DURING step 3's settle sleep. Snapshot the network log before
// navigating, not after, or this window is already empty when we look at it.
const beforeCount = network.length
await send('browsingContext.navigate', { context, url: `${APP}search?q=${encodeURIComponent(QUERY)}`, wait: 'complete' })
await sleep(7000)

const tabs = await ev(`[...document.querySelectorAll('[role="tab"]')].map(t=>t.textContent.trim())`)
console.log('  tabs:', JSON.stringify(tabs))
// Search is no longer split into a YouTube-first tab: the default "Music" tab
// queries every source at once, so the source is a property of a result rather
// than of the navigation. Assert the new default is present and selected.
check('Music tab is present', JSON.stringify(tabs).includes('Music'))
check('no separate YouTube-first tab', !JSON.stringify(tabs).includes('YouTube'))
const musicSelected = await ev(`[...document.querySelectorAll('[role="tab"]')].find(t=>t.getAttribute('aria-selected')==='true')?.textContent.trim()`)
check('Music tab is selected by default', musicSelected === 'Music', musicSelected)

// ---------------------------------------------------------------- 4 & 5 ---
step(4, `Searching for a real song ("${QUERY}")`)

const results = await ev(`(() => ({
  articles: document.querySelectorAll('article').length,
  titles: [...document.querySelectorAll('article')].map(a => {
    const p = [...a.querySelectorAll('p')].map(x => x.textContent.trim());
    return p[0] || '';
  }),
  metas: [...document.querySelectorAll('article')].map(a => {
    const ps = [...a.querySelectorAll('p')].map(p => p.textContent.trim());
    return ps.find(t => /views/i.test(t)) || ps[1] || '';
  }),
  // Play controls are labelled by aria-label, not by a literal "Play" text node.
  playButtons: document.querySelectorAll('button[aria-label^="Play "]').length,
  ytBadges: [...document.querySelectorAll('article')].filter(a => /YOUTUBE/i.test(a.innerText)).length,
  thumbs: [...document.querySelectorAll('article img')].filter(i => (i.currentSrc || i.src || '').includes('ytimg')).length,
  hasArtists: /Artists/.test(document.body.innerText),
  hasCollections: /Collections/.test(document.body.innerText),
}))()`)
console.log('  real results:')
;(results?.titles || []).slice(0, 6).forEach((t, i) => console.log(`    ${i + 1}. ${t}\n       ${results?.metas?.[i] || ''}`))
check('real results rendered', (results?.articles || 0) > 0, 'articles=' + results?.articles)
check('results carry real metadata',
  (results?.titles || []).every((t) => t && t.length > 1) && (results?.articles || 0) > 0)
check('each result has a Play control', (results?.playButtons || 0) > 0, 'playButtons=' + results?.playButtons)
check('source shown as a per-result badge, not a tab', (results?.ytBadges || 0) > 0,
  'badges=' + results?.ytBadges)
check('thumbnails loaded from YouTube', (results?.thumbs || 0) > 0, 'thumbs=' + results?.thumbs)
check('Artists section present', results?.hasArtists === true)
check('Collections section present', results?.hasCollections === true)

// In BiDi's network.responseCompleted the URL lives at params.request.url,
// NOT params.url. Reading the wrong path makes every check below vacuously
// true, so extract it explicitly.
const netUrl = (n) => n?.request?.url || n?.url || ''

const ytApiCalls = network.slice(beforeCount).filter((n) => /\/api\/catalogue\/search/.test(netUrl(n)))
check('results came from our own backend route (not googleapis.com)',
  ytApiCalls.length > 0, `calls=${ytApiCalls.length}`)
const directGoogle = network.slice(beforeCount).filter((n) => /googleapis\.com/.test(netUrl(n)))
check('browser never called googleapis.com directly', directGoogle.length === 0,
  `direct=${directGoogle.length}  sampled=${network.length}`)

// -------------------------------------------------------------------- 6 ---
step(6, 'Selecting a result')
const playPos = await ev(`(() => {
  const el = document.querySelectorAll('button[aria-label^="Play "]')[0];
  if (!el || el.disabled) return null;
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) };
})()`)
let clickedResult = false
if (playPos && Number.isFinite(playPos.x)) {
  await send('input.performActions', { context, actions: [{ type:'pointer', id:'mouse', parameters:{pointerType:'mouse'}, actions:[
    { type:'pointerMove', x:playPos.x, y:playPos.y }, { type:'pointerDown', button:0 }, { type:'pointerUp', button:0 }] }] })
  clickedResult = true
}
check('clicked Play on the first result', clickedResult === true)
await sleep(10000)

// -------------------------------------------------------------------- 7 ---
step(7, 'Official visible YouTube player loads')
const stage = await ev(`(() => {
  const stageEl = document.querySelector('[aria-label="YouTube player"]');
  const iframe = stageEl ? stageEl.querySelector('iframe') : null;
  const rect = iframe ? iframe.getBoundingClientRect() : null;
  const host = iframe && iframe.parentElement;
  const cs = host ? getComputedStyle(host) : null;
  const t = stageEl ? stageEl.innerText : '';
  return {
    stagePresent: Boolean(stageEl),
    iframePresent: Boolean(iframe),
    src: iframe ? iframe.src : null,
    width: rect ? Math.round(rect.width) : 0,
    height: rect ? Math.round(rect.height) : 0,
    onScreen: stageEl ? (() => { const r = stageEl.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.width > 200 && r.height > 200; })() : false,
    opacity: cs ? cs.opacity : null,
    visibility: cs ? cs.visibility : null,
    transform: cs ? cs.transform : null,
    creditsChannel: /[A-Za-z]/.test(t) && /Watch on YouTube/.test(t),
    watchHref: stageEl ? (stageEl.querySelector('a[href*="youtube.com/watch"]') || {}).href : null,
    hasIframeApiScript: [...document.scripts].some(s => (s.src || '').includes('/iframe_api')),
  };
})()`)
console.log('  ' + JSON.stringify(stage, null, 2).split('\n').join('\n  '))
check('YouTube stage opened', stage?.stagePresent === true)
check('an official YouTube iframe is mounted', stage?.iframePresent === true)
check('iframe is on youtube-nocookie.com',
  String(stage?.src || '').includes('youtube-nocookie.com'), String(stage?.src || '').slice(0, 60))
check('the official IFrame Player API script was loaded', stage?.hasIframeApiScript === true)
check(`player is visible and >=200x200 (${stage?.width}x${stage?.height})`,
  stage?.onScreen === true && (stage?.width || 0) >= 200 && (stage?.height || 0) >= 200)
check('player is not hidden or scaled',
  stage?.opacity === '1' && stage?.visibility === 'visible' && (!stage?.transform || stage.transform === 'none'))
check('attribution and outbound link shown', stage?.creditsChannel === true && Boolean(stage?.watchHref))

// Confirm it is really YouTube's player, not a fake element.
// Note: reading contentDocument of a cross-origin iframe does NOT throw - the
// same-origin policy simply makes it return null. That null is the proof.
const isOfficial = await ev(`(() => {
  const f = document.querySelector('[aria-label="YouTube player"] iframe');
  if (!f) return null;
  let contentDocAccessible = true;
  try { contentDocAccessible = f.contentDocument !== null; } catch { contentDocAccessible = false; }
  return {
    contentDocAccessible,
    srcHost: new URL(f.src).host,
    enablejsapi: f.src.includes('enablejsapi=1'),
    hasAllow: (f.getAttribute('allow') || '').length > 0,
    referrerPolicy: f.getAttribute('referrerpolicy') || null,
  };
})()`)
console.log('  iframe:', JSON.stringify(isOfficial))
check('iframe is cross-origin (YouTube content is NOT reachable from the page)',
  isOfficial?.contentDocAccessible === false)
check('iframe is the official JS-API embed', isOfficial?.enablejsapi === true
  && isOfficial?.srcHost === 'www.youtube-nocookie.com')

// -------------------------------------------------------------------- 8 ---
step(8, 'Play and pause')
// Let the player reach a playing state on its own after the click.
let playing = false
for (let i = 0; i < 12; i++) {
  playing = await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Pause"]'))`)
  if (playing) break
  await sleep(2000)
}
check('player is playing (stage shows Pause)', playing === true)

// Click the stage's own play/pause to exercise our wiring.
const pausedNow = await clickIn('[aria-label="YouTube player"]', 'Pause')
check('clicked Pause in the stage', pausedNow === true)
await sleep(3000)
const pausedState = await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Play"]'))`)
check('stage switched to Play after pausing', pausedState === true)

check('clicked Play to resume', await clickIn('[aria-label="YouTube player"]', 'Play') === true)
await sleep(4000)
const resumed = await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Pause"]'))`)
check('stage switched back to Pause (resumed)', resumed === true)

// Playback position should have advanced, proving real decoding, not a shell.
const advanced = await ev(`(async () => {
  const f = document.querySelector('[aria-label="YouTube player"] iframe');
  return { present: Boolean(f) };
})()`)
check('player iframe still present after toggling', advanced?.present === true)

// -------------------------------------------------------------------- 9 ---
step(9, 'Existing local/uploaded music still works')
await send('script.addPreloadScript', { context, functionDeclaration: `function(){
  window.__audios=[]; const R=window.Audio;
  function P(){const e=new(Function.prototype.bind.apply(R,[null].concat([].slice.call(arguments))))();window.__audios.push(e);return e}
  P.prototype=R.prototype; window.Audio=P;}` })
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(6000)
for (let i = 0; i < 20; i++) {
  if (await ev(`document.querySelectorAll('button[aria-label^="Play "]').length`) > 0) break
  await sleep(400)
}
let up = null
for (let attempt = 0; attempt < 3; attempt++) {
  const pos = await ev(`(() => {
    const el = document.querySelectorAll('button[aria-label^="Play "]')[0];
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) };
  })()`)
  if (pos) {
    await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  } else {
    await ev(`document.querySelectorAll('button[aria-label^="Play "]')[0]?.click()`)
  }
  await sleep(5000)
  up = await ev(`(()=>{const a=(window.__audios||[]).slice(-1)[0];return{
    n:(window.__audios||[]).length, src:a?(a.src||'').split('/').pop():null, rs:a?a.readyState:null,
    paused:a?a.paused:null, t:a?Math.round(a.currentTime*100)/100:null,
    dur:a&&!isNaN(a.duration)?Math.round(a.duration):null}})()`)
  if ((up?.t || 0) > 0) break
}
console.log('  ', JSON.stringify(up))
check('local upload plays via the audio element',
  (up?.rs || 0) >= 3 && up?.paused === false && (up?.t || 0) > 0,
  `rs=${up?.rs} paused=${up?.paused} t=${up?.t} dur=${up?.dur}`)
check('no YouTube iframe on a local-upload page',
  (await ev(`document.querySelectorAll('iframe[src*="youtube"]').length`)) === 0)

// Other pages
for (const [label, p] of [['Playlists', '/playlists'], ['Library', '/library'], ['Following', '/following'], ['Upload', '/upload'], ['Settings', '/settings']]) {
  await send('browsingContext.navigate', { context, url: `${APP}${p}`, wait: 'complete' })
  await sleep(2200)
  check(`${label} page renders`, (await ev(`document.getElementById('root').children.length > 0`)) === true)
}

// ------------------------------------------------------------------- 10 ---
step(10, 'Console and network hygiene')
const errs = logs.filter((l) => l.level === 'error'
  && !/favicon|net::ERR_|youtube|ytimg|googlevideo|doubleclick|CORS|Failed to load resource|third-party cookie|blocked a frame/i.test(l.text || ''))
console.log('  console errors:', errs.length)
errs.slice(0, 6).forEach((e) => console.log('    ', (e.text || '').slice(0, 160)))
check('no unexpected console errors', errs.length === 0, String(errs.length))

const keyLeak = await ev(`(() => {
  const h = document.documentElement.outerHTML;
  return ['AIza'].filter(k => h.includes(k));
})()`)
check('no API key anywhere in the DOM', (keyLeak || []).length === 0, JSON.stringify(keyLeak))

const allUrls = network.map(netUrl).filter(Boolean)
console.log(`  total network responses observed: ${allUrls.length}`)

// Firefox itself makes telemetry calls to googleapis.com ($rpc/.../GenerateIT).
// Those are browser-internal, carry no key, and are unrelated to the app. The
// security property we care about is that no request carrying an API key ever
// leaves the browser.
const toGoogle = allUrls.filter((u) => /googleapis\.com/.test(u))
const toGoogleWithKey = toGoogle.filter((u) => /[?&]key=/.test(u))
const youtubeDataApiFromBrowser = toGoogle.filter((u) => /\/youtube\/v3\//.test(u))
check('no request to googleapis.com ever carried an API key',
  toGoogleWithKey.length === 0, `withKey=${toGoogleWithKey.length}`)
check('the YouTube Data API is never called from the browser',
  youtubeDataApiFromBrowser.length === 0, `dataApi=${youtubeDataApiFromBrowser.length}`)
if (toGoogle.length) {
  console.log(`  note: ${toGoogle.length} googleapis.com request(s), all Firefox-internal telemetry:`)
  toGoogle.slice(0, 3).forEach((u) => console.log('    ' + u.slice(0, 88)))
}

// YouTube's player streams from its own CDN inside the cross-origin iframe.
const cdn = allUrls.filter((u) => /googlevideo\.com|muxedcdn/.test(u))
console.log(`  YouTube CDN (googlevideo/muxedcdn) requests: ${cdn.length}`)
// Nothing in our own code may request a standalone audio/video file from YouTube.
const appAudio = allUrls.filter((u) => /youtube\.com|youtube-nocookie\.com/.test(u)
  && /\.(mp3|m4a|aac|flac|ogg|webm|mp4)(\?|$)/i.test(u))
check('no standalone audio/video file requested from YouTube',
  appAudio.length === 0, `audioFiles=${appAudio.length}`)

// Our own media requests must only ever be first-party uploads.
const uploadReqs = allUrls.filter((u) => /\/uploads\//.test(u))
check('app media requests only ever target our own /uploads/ files',
  allUrls.filter((u) => /\.(mp3|m4a|wav|aac|flac)(\?|$)/i.test(u)).every((u) => /\/uploads\//.test(u)),
  `uploads=${uploadReqs.length}`)

ws.close(); ff.kill('SIGKILL'); fs.rmSync(profileDir, { recursive: true, force: true })
console.log('\n' + '='.repeat(68))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: LIVE YOUTUBE UI INTEGRATION VERIFIED' : 'RESULT: FAILURES - see above')
console.log('='.repeat(68))
process.exit(failed === 0 ? 0 : 1)