/**
 * Search / playback UX regression suite.
 *
 * Verifies the behaviour a normal music app must have:
 *   A. Search "Ayyarettu"
 *   B. Play the first result
 *   C. Playback confirmed
 *   D. Search "Blinding Lights" - results update while the player stays alive
 *   E. Previous track still playing / still reachable
 *   F. Click a Blinding Lights result
 *   G. The official YouTube player switches to the new video IN PLACE
 *   H. Search "A.R. Rahman" - results appear, player not destroyed
 *   J. Click another song - playback switches again
 *   L. Local uploaded song still plays through the audio element
 *   M. Browser console clean
 *
 * Critically it also asserts the Search page is NOT covered by a modal: the
 * results must stay visible and interactive after a song starts playing.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const API = 'http://localhost:5000/api'
const PORT = 9597
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-ux-'))
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
const ev = async (x) => {
  const r = await send('script.evaluate', { expression: x, target: { context }, awaitPromise: true, resultOwnership: 'none' })
  return de(r?.result)
}
const clickPlay = async (n = 0) => {
  const pos = await ev(`(() => {
    const el = document.querySelectorAll('button[aria-label^="Play "]')[${n}];
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) };
  })()`)
  if (!pos || !Number.isFinite(pos.x)) return false
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  return true
}

/** Navigates the Search page to a new query WITHOUT a full page load. */
const searchInApp = async (q) => {
  await ev(`(() => {
    const input = document.querySelector('#search-input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, ${JSON.stringify(q)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = input.closest('form');
    if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`)
  await sleep(7000)
}


/**
 * The official embed puts the video id in the URL PATH (/embed/<id>), not a
 * `v` query parameter. Reading `searchParams.get('v')` returns null, which made
 * every id comparison below compare undefined to undefined and pass/fail for
 * the wrong reason.
 */
const dockVideoId = async () =>
  ev(`(() => {
    const f = document.querySelector('[data-youtube-dock] iframe');
    if (!f) return null;
    const m = f.src.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  })()`)

const dockTitle = async () =>
  ev(`document.querySelector('[data-youtube-dock] p')?.textContent?.trim() || null`)

console.log('='.repeat(68))
console.log('SEARCH / PLAYBACK UX VERIFICATION')
console.log('='.repeat(68))

// ---- login ----
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

// ============================================================ A =========
console.log('\n=== A. Search "Ayyarettu" ===')
await send('browsingContext.navigate', { context, url: `${APP}search?q=Ayyarettu`, wait: 'complete' })
await sleep(8000)
const ayy = await ev(`(() => ({
  results: document.querySelectorAll('button[aria-label^="Play "]').length,
  first: document.querySelector('button[aria-label^="Play "]')?.getAttribute('aria-label'),
  noModal: document.querySelectorAll('[aria-modal="true"]').length,
}))()`)
console.log('  ' + JSON.stringify(ayy))
check('A: real results for Ayyarettu', (ayy?.results || 0) > 0, 'results=' + ayy?.results)

// ============================================================ B =========
console.log('\n=== B/C. Play the first result, confirm playback ===')
check('B: clicked Play on first result', await clickPlay(0) === true)
await sleep(10000)
const playing1 = await ev(`(() => {
  const dock = document.querySelector('[data-youtube-dock]');
  const iframe = dock?.querySelector('iframe');
  const rect = iframe?.getBoundingClientRect();
  return {
    dock: Boolean(dock),
    iframe: Boolean(iframe),
    src: iframe?.src || '',
    nocookie: (iframe?.src || '').includes('youtube-nocookie.com'),
    w: rect ? Math.round(rect.width) : 0,
    h: rect ? Math.round(rect.height) : 0,
    onScreen: (() => { const r = dock?.getBoundingClientRect(); if (!r) return false;
      return r.top < window.innerHeight && r.bottom > 0; })(),
    pauseBtn: Boolean(dock?.querySelector('button[aria-label="Pause"]')),
  };
})()`)
console.log('  ' + JSON.stringify(playing1))
check('C: YouTube dock appeared', playing1?.dock === true)
check('C: official player iframe mounted', playing1?.iframe === true)
check('C: nocookie host', playing1?.nocookie === true)
check(`C: player visible >=200x200 (${playing1?.w}x${playing1?.h})`,
  (playing1?.w || 0) >= 200 && (playing1?.h || 0) >= 200 && playing1?.onScreen === true)
check('C: player is playing', playing1?.pauseBtn === true)
const firstTitle = await dockTitle()

// ============================================================ KEY UX =====
// The whole point: the Search page must still be usable.
console.log('\n=== KEY UX: Search page stays visible & usable while playing ===')
const stillSearch = await ev(`(() => {
  const input = document.querySelector('#search-input');
  const r = input?.getBoundingClientRect();
  return {
    path: location.pathname,
    searchBoxVisible: Boolean(r && r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0),
    searchBoxInViewport: Boolean(r && r.top >= 0 && r.bottom <= window.innerHeight),
    resultCount: document.querySelectorAll('button[aria-label^="Play "]').length,
    modalOverlays: document.querySelectorAll('[aria-modal="true"]').length,
    dockPresent: Boolean(document.querySelector('[data-youtube-dock]')),
    scrollable: document.documentElement.scrollHeight > window.innerHeight,
  };
})()`)
console.log('  ' + JSON.stringify(stillSearch))
check('still on the Search page', stillSearch?.path === '/search', stillSearch?.path)
check('search box still visible and not covered', stillSearch?.searchBoxVisible === true)
check('NO modal overlay blocking the page', stillSearch?.modalOverlays === 0,
  'modals=' + stillSearch?.modalOverlays)
check('search results still rendered', (stillSearch?.resultCount || 0) > 0,
  'results=' + stillSearch?.resultCount)
check('page is still scrollable', stillSearch?.scrollable === true)
check('YouTube dock is still present', stillSearch?.dockPresent === true)

// ============================================================ D/E ========
console.log('\n=== D/E. Search "Blinding Lights" while the track keeps playing ===')
const firstVideoId = await dockVideoId()
await searchInApp('Blinding Lights')
const dockVidAfterD = await dockVideoId()
const dockTitleAfterD = await dockTitle()
const afterD = await ev(`(() => ({
  path: location.pathname,
  query: new URLSearchParams(location.search).get('q'),
  titles: [...document.querySelectorAll('article p:first-of-type')].slice(0,3).map(p=>p.textContent.trim()),
  results: document.querySelectorAll('button[aria-label^="Play "]').length,
  dockStillHere: Boolean(document.querySelector('[data-youtube-dock] iframe')),
}))()`)
console.log('  ' + JSON.stringify(afterD, null, 1).replace(/\n/g, '\n  '))
check('D: still on Search', afterD?.path === '/search')
check('D: URL query updated', (afterD?.query || '').toLowerCase().includes('blinding'), afterD?.query)
check('E: Blinding Lights results appeared', (afterD?.results || 0) > 0, 'results=' + afterD?.results)
check('E: previous player SURVIVED the new search (same video + title)',
  afterD?.dockStillHere === true && dockVidAfterD === firstVideoId && dockTitleAfterD === firstTitle,
  `was=${firstVideoId}/${firstTitle} now=${dockVidAfterD}/${dockTitleAfterD}`)

// ============================================================ F/G =======
console.log('\n=== F/G. Click a Blinding Lights result -> player switches in place ===')
// Pick the first result whose title differs from what is already playing, so a
// switch is actually observable.
const pickIdx = await ev(`(() => {
  const cur = document.querySelector('[data-youtube-dock] p')?.textContent?.trim() || '';
  const btns = [...document.querySelectorAll('button[aria-label^="Play "]')];
  const i = btns.findIndex(b => {
    const a = b.getAttribute('aria-label') || '';
    return a && !a.includes(cur);
  });
  return i;
})()`)
console.log('  clicking result index:', pickIdx)
check('F: clicked a different result', pickIdx >= 0 && await clickPlay(pickIdx) === true)
await sleep(9000)
const vidG = await dockVideoId()
const afterG = await ev(`(() => {
  const dock = document.querySelector('[data-youtube-dock]');
  const iframe = dock?.querySelector('iframe');
  return {
    path: location.pathname,
    videoId: new URL(iframe?.src || 'https://x/').searchParams.get('v'),
    dockTitle: dock?.querySelector('p')?.textContent.trim(),
    playing: Boolean(dock?.querySelector('button[aria-label="Pause"]')),
    resultsStillVisible: document.querySelectorAll('button[aria-label^="Play "]').length,
    searchBox: Boolean(document.querySelector('#search-input')),
  };
})()`)
console.log('  ' + JSON.stringify(afterG))
check('G: player switched to a different video', afterG?.videoId && afterG.videoId !== firstVideoId,
  `${firstVideoId} -> ${afterG?.videoId}`)
check('G: still on Search page', afterG?.path === '/search')
check('G: no page reload / results intact', (afterG?.resultsStillVisible || 0) > 0)
check('G: new video is playing', afterG?.playing === true)

// ============================================================ H/I ========
console.log('\n=== H/I. Search "A.R. Rahman" without destroying the player ===')
const videoBeforeH = vidG
await searchInApp('A.R. Rahman')
const afterI = await ev(`(() => ({
  path: location.pathname,
  query: new URLSearchParams(location.search).get('q'),
  results: document.querySelectorAll('button[aria-label^="Play "]').length,
  first: document.querySelector('button[aria-label^="Play "]')?.getAttribute('aria-label'),
  playing: Boolean(document.querySelector('[data-youtube-dock] button[aria-label="Pause"]')),
}))()`)
console.log('  ' + JSON.stringify(afterI))
check('I: A.R. Rahman results appeared', (afterI?.results || 0) > 0, 'results=' + afterI?.results)
check('I: player NOT destroyed', (await dockVideoId()) === videoBeforeH,
  `was=${videoBeforeH} now=${await dockVideoId()}`)
check('I: still playing', afterI?.playing === true)

// ============================================================ J/K ========
console.log('\n=== J/K. Click another song -> playback switches again ===')
check('J: clicked another result', await clickPlay(0) === true)
await sleep(9000)
const afterK = await ev(`(() => {
  const dock = document.querySelector('[data-youtube-dock]');
  return {
    title: dock?.querySelector('p')?.textContent.trim(),
    playing: Boolean(dock?.querySelector('button[aria-label="Pause"]')),
    onSearch: location.pathname === '/search',
  };
})()`)
console.log('  ' + JSON.stringify(afterK))
const vidK = await dockVideoId()
check('K: switched to yet another video', vidK && vidK !== videoBeforeH,
  `${videoBeforeH} -> ${vidK}`)
check('K: playing', afterK?.playing === true)
check('K: still on Search', afterK?.onSearch === true)

// ============================================================ miniplayer =
console.log('\n=== Mini-player controls (persistent bar) ===')
const mini = await ev(`(() => {
  const bar = document.querySelector('button[aria-label="Open full player"], button[aria-label="Show the YouTube player"]');
  const r = bar?.closest('div.fixed')?.getBoundingClientRect();
  return {
    hasBar: Boolean(bar),
    title: bar?.textContent?.trim().slice(0,60),
    prev: Boolean(document.querySelector('button[aria-label="Previous track"]')),
    next: Boolean(document.querySelector('button[aria-label="Next track"]')),
    playPause: Boolean(document.querySelector('button[aria-label="Play"], button[aria-label="Pause"]')),
    artwork: Boolean(document.querySelector('.fixed img')),
    visible: Boolean(r && r.top < window.innerHeight && r.bottom > 0),
  };
})()`)
console.log('  ' + JSON.stringify(mini))
check('mini-player bar visible', mini?.visible === true)
check('mini-player shows title', Boolean(mini?.title))
check('mini-player shows previous', mini?.prev === true)
check('mini-player shows next', mini?.next === true)
check('mini-player shows play/pause', mini?.playPause === true)
check('mini-player shows artwork', mini?.artwork === true)

// ============================================================ L =========
console.log('\n=== L. Local uploaded song still plays ===')
await send('script.addPreloadScript', { context, functionDeclaration: `function(){
  window.__audios=[]; const R=window.Audio;
  function P(){const e=new(Function.prototype.bind.apply(R,[null].concat([].slice.call(arguments))))();window.__audios.push(e);return e}
  P.prototype=R.prototype; window.Audio=P;}` })
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(7000)
let up = null
for (let a = 0; a < 4; a++) {
  const pos = await ev(`(() => {
    const btn = [...document.querySelectorAll('button[aria-label^="Play "]')].find(b => {
      const art = b.closest('article'); return art && /MUSICA/i.test(art.innerText);
    }) || document.querySelectorAll('button[aria-label^="Play "]')[0];
    if (!btn || btn.disabled) return null;
    btn.scrollIntoView({ block: 'center' });
    const b = btn.getBoundingClientRect();
    return { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) };
  })()`)
  if (pos) {
    await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  } else await ev(`document.querySelectorAll('button[aria-label^="Play "]')[0]?.click()`)
  await sleep(5000)
  up = await ev(`(()=>{const a=(window.__audios||[]).slice(-1)[0];return{n:(window.__audios||[]).length,
    src:a?(a.src||'').split('/').pop():null, rs:a?a.readyState:null, paused:a?a.paused:null,
    t:a?Math.round(a.currentTime*100)/100:null}})()`)
  if ((up?.t || 0) > 0) break
}
console.log('  ' + JSON.stringify(up))
check('L: single Audio element', up?.n === 1, 'n=' + up?.n)
check('L: local upload plays', (up?.rs || 0) >= 3 && up?.paused === false && (up?.t || 0) > 0,
  `rs=${up?.rs} paused=${up?.paused} t=${up?.t}`)

// ============================================================ M =========
console.log('\n=== M. Console hygiene ===')
const errs = logs.filter((l) => l.level === 'error'
  && !/favicon|net::ERR_|youtube|ytimg|googlevideo|doubleclick|CORS|Failed to load resource|third-party cookie|blocked a frame/i.test(l.text || ''))
console.log('  console errors:', errs.length)
errs.slice(0, 6).forEach((e) => console.log('    ', (e.text || '').slice(0, 150)))
check('M: zero unexpected console errors', errs.length === 0, String(errs.length))

ws.close(); ff.kill('SIGKILL'); fs.rmSync(profileDir, { recursive: true, force: true })
console.log('\n' + '='.repeat(68))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: SEARCH / PLAYBACK UX VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(68))
process.exit(failed === 0 ? 0 : 1)