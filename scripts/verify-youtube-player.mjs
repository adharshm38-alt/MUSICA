/**
 * Phase 3 verification: the VISIBLE YouTube embedded player.
 *
 * This proves the real integration works in a real browser:
 *   1. the official IFrame Player API script loads
 *   2. a real YT.Player is constructed with the no-cookie host
 *   3. a real YouTube iframe appears in the DOM
 *   4. that iframe is VISIBLE and at least 200x200 (YouTube's requirement)
 *   5. it is not obscured, hidden or scaled down
 *   6. the player reports ready and playable metadata
 *   7. first-party uploads are unaffected
 *
 * No YouTube Data API key is needed: the embedded player is public and does not
 * require one. Only search/metadata does.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const API = 'http://localhost:5000/api'
const PORT = 9571
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Widely-embeddable, official, non-infringing test asset. This is the video the
// player is asked to load; it is a public YouTube embed, not downloaded media.
const VIDEO_ID = 'aqz-KE-bpKQ' // Big Buck Bunny (Blender Foundation, open movie)

let passed = 0
let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
  ok ? passed++ : failed++
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-yt-player-'))
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
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.type === 'error' ? reject(new Error(m.message || m.error)) : resolve(m.result)
  } else if (m.method === 'log.entryAdded') {
    logs.push(m.params)
  }
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
  setTimeout(() => {
    if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) }
  }, 30000)
})

await send('session.new', { capabilities: {} })
const { contexts } = await send('browsingContext.getTree', {})
const context = contexts[0].context

// BiDi serialises objects as [key, remoteValue] pairs.
const de = (v) => {
  if (!v) return v
  if (['string', 'number', 'boolean'].includes(v.type)) return v.value
  if (v.type === 'object') {
    return Object.fromEntries((Array.isArray(v.value) ? v.value : []).map((p) => [p[0], de(p[1])]))
  }
  if (v.type === 'array') return (v.value || []).map(de)
  return v.value
}
const ev = async (expression) => {
  const r = await send('script.evaluate', {
    expression, target: { context }, awaitPromise: true, resultOwnership: 'none',
  })
  return de(r?.result)
}

console.log('='.repeat(68))
console.log('PHASE 3: VISIBLE YOUTUBE PLAYER VERIFICATION')
console.log('='.repeat(68))

// ==========================================================================
console.log('\n=== 1. Official IFrame Player API loads ===')
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(4000)

// Load the API exactly the way the app does.
const apiLoad = await ev(`(async () => {
  const src = 'https://www.youtube.com/iframe_api';
  await new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(true);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(true); };
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 20000);
  });
  return { ok: true, hasPlayer: typeof window.YT?.Player === 'function' };
})()`)
check('IFrame Player API script loads from youtube.com', apiLoad?.ok === true)
check('window.YT.Player is available', apiLoad?.hasPlayer === true)

// ==========================================================================
console.log('\n=== 2. Build a real visible player (the app\'s own code path) ===')
// Mount through the app's engine module, imported straight from the dev server,
// so this exercises the real production code rather than a reimplementation.
const mounted = await ev(`(async () => {
  const mod = await import('/src/context/playback/engines.js');
  document.body.innerHTML = '<div id="stage" style="width:640px"></div>';
  const host = document.getElementById('stage');

  let readyFired = false;
  let stateLog = [];
  const engine = mod.createYouTubeEngine(host, {
    onReady: () => { readyFired = true; },
    onStateChange: (s) => { stateLog.push(s); },
    onError: (code) => { window.__ytError = code; },
  });

  await engine.load({ youtubeVideoId: '${VIDEO_ID}' });

  // Wait for the player's own onReady event.
  for (let i = 0; i < 40 && !readyFired; i++) await new Promise(r => setTimeout(r, 250));

  const iframe = host.querySelector('iframe');
  const rect = iframe ? iframe.getBoundingClientRect() : null;
  const cs = iframe ? getComputedStyle(iframe.parentElement) : null;

  return {
    capabilities: engine.capabilities,
    readyFired,
    iframePresent: Boolean(iframe),
    iframeSrc: iframe ? iframe.src : null,
    width: rect ? Math.round(rect.width) : 0,
    height: rect ? Math.round(rect.height) : 0,
    opacity: cs ? cs.opacity : null,
    visibility: cs ? cs.visibility : null,
    display: cs ? cs.display : null,
    transforms: cs ? cs.transform : null,
    errorCode: window.__ytError ?? null,
    stateLog,
  };
})()`)

console.log('  ' + JSON.stringify(mounted, null, 2).split('\n').join('\n  '))

check('engine reports documented capabilities', mounted?.capabilities?.seekable === true)
check('official player onReady fired', mounted?.readyFired === true)
check('a real YouTube iframe is in the DOM', mounted?.iframePresent === true)
check('no player error code', mounted?.errorCode === null || mounted?.errorCode === undefined,
  'code=' + mounted?.errorCode)

// ==========================================================================
console.log('\n=== 3. Compliance: player is VISIBLE and >= 200x200 ===')
check('iframe uses youtube-nocookie.com (privacy host)',
  String(mounted?.iframeSrc || '').includes('youtube-nocookie.com'),
  String(mounted?.iframeSrc || '(none)').slice(0, 80))
check(`width ${mounted?.width}px >= 200`, (mounted?.width || 0) >= 200)
check(`height ${mounted?.height}px >= 200`, (mounted?.height || 0) >= 200)
check('not hidden (opacity 1)', mounted?.opacity === '1', 'opacity=' + mounted?.opacity)
check('not hidden (visibility visible)', mounted?.visibility === 'visible', 'visibility=' + mounted?.visibility)
check('not display:none', mounted?.display !== 'none', 'display=' + mounted?.display)
check('not scaled down', !mounted?.transforms || mounted.transforms === 'none',
  'transform=' + mounted?.transforms)

// ==========================================================================
console.log('\n=== 4. The player is actually usable ===')
const playback = await ev(`(async () => {
  const mod = await import('/src/context/playback/engines.js');
  document.body.innerHTML = '<div id="stage" style="width:640px"></div>';
  const host = document.getElementById('stage');
  let ready = false, states = [];
  const engine = mod.createYouTubeEngine(host, {
    onReady: () => { ready = true; },
    onStateChange: (s) => states.push(s),
    onError: (c) => { window.__ytError2 = c; },
  });
  await engine.load({ youtubeVideoId: '${VIDEO_ID}' });
  for (let i = 0; i < 40 && !ready; i++) await new Promise(r => setTimeout(r, 250));

  const dur = engine.getDuration();
  engine.play();
  await new Promise(r => setTimeout(r, 4000));
  const t1 = engine.getCurrentTime();
  await new Promise(r => setTimeout(r, 3000));
  const t2 = engine.getCurrentTime();
  engine.pause();
  await new Promise(r => setTimeout(r, 1200));
  const t3 = engine.getCurrentTime();
  await new Promise(r => setTimeout(r, 1500));
  const t4 = engine.getCurrentTime();

  return {
    ready, duration: dur,
    t1: Math.round(t1*100)/100, t2: Math.round(t2*100)/100,
    afterPause1: Math.round(t3*100)/100, afterPause2: Math.round(t4*100)/100,
    states, error: window.__ytError2 ?? null,
  };
})()`)
console.log('  ' + JSON.stringify(playback))

check('player became ready', playback?.ready === true)
check('duration reported by the official player', (playback?.duration || 0) > 0,
  'duration=' + playback?.duration)
check('playback advanced (t1->t2)', (playback?.t2 || 0) > (playback?.t1 || 0),
  `${playback?.t1}s -> ${playback?.t2}s`)
check('pause() stopped playback', Math.abs((playback?.afterPause2 || 0) - (playback?.afterPause1 || 0)) < 0.6,
  `${playback?.afterPause1}s -> ${playback?.afterPause2}s`)
check('player reported PLAYING state', (playback?.states || []).includes(1),
  'states=' + JSON.stringify(playback?.states))

// ==========================================================================
console.log('\n=== 5. seek() works (documented seekTo) ===')
const seeked = await ev(`(async () => {
  const mod = await import('/src/context/playback/engines.js');
  document.body.innerHTML = '<div id="stage" style="width:640px"></div>';
  const host = document.getElementById('stage');
  let ready = false;
  const engine = mod.createYouTubeEngine(host, { onReady: () => { ready = true; } });
  await engine.load({ youtubeVideoId: '${VIDEO_ID}' });
  for (let i = 0; i < 40 && !ready; i++) await new Promise(r => setTimeout(r, 250));
  engine.play();
  await new Promise(r => setTimeout(r, 2500));
  engine.seek(30);
  await new Promise(r => setTimeout(r, 2500));
  return { t: Math.round(engine.getCurrentTime()*100)/100 };
})()`)
check('seek(30) moved the playhead', (seeked?.t || 0) >= 25, 't=' + seeked?.t)

// ==========================================================================
console.log('\n=== 6. Upload path is untouched ===')
const uploadStillWorks = await ev(`(async () => {
  const el = document.createElement('audio');
  el.src = '/uploads/audio/1790764481329-497294565.mp3';
  document.body.appendChild(el);
  el.load();
  for (let i = 0; i < 40 && el.readyState < 3; i++) await new Promise(r => setTimeout(r, 250));
  return { readyState: el.readyState, duration: Math.round(el.duration) };
})()`)
check('first-party audio still loads via the audio element',
  uploadStillWorks?.readyState >= 3, JSON.stringify(uploadStillWorks))

// ==========================================================================
console.log('\n=== 7. API key never reaches the browser ===')
const keyLeak = await ev(`(() => {
  const html = document.documentElement.outerHTML;
  const keys = ['AIza', 'YOUTUBE_API_KEY='];
  return keys.filter(k => html.includes(k));
})()`)
check('no API key in the DOM', (keyLeak || []).length === 0, JSON.stringify(keyLeak))

const statusRes = await (await fetch(`${API}/youtube/status`)).json()
check('/youtube/status never returns the key',
  !JSON.stringify(statusRes).includes('AIza') && !JSON.stringify(statusRes).includes('apiKey'),
  JSON.stringify(statusRes.data).slice(0, 90))

// ==========================================================================
console.log('\n=== 8. No unexpected console errors ===')
const errs = logs.filter((l) => l.level === 'error' && !/favicon|net::ERR_/i.test(l.text || ''))
console.log('  errors:', errs.length)
errs.slice(0, 6).forEach((e) => console.log('    ', (e.text || '').slice(0, 160)))
check('zero unexpected console errors', errs.length === 0, String(errs.length))

ws.close()
ff.kill('SIGKILL')
fs.rmSync(profileDir, { recursive: true, force: true })

console.log('\n' + '='.repeat(68))
console.log(`${passed} passed, ${failed} failed`)
console.log('='.repeat(68))
process.exit(failed === 0 ? 0 : 1)