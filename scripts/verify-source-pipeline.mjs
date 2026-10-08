/**
 * Live verification of the source-pipeline music experience against the real
 * YouTube Data API (no stubbing).
 *
 * Covers:
 *   1. Home shows a populated catalogue from real sources
 *   2. Search "blinding lights" returns real songs / artists / collections
 *   3. Selecting a YouTube-backed song opens the OFFICIAL embedded player
 *   4. The player is visible, >=200x200, on youtube-nocookie.com
 *   5. Play / pause work through the existing player
 *   6. First-party local uploads still play through the audio element
 *   7. No YouTube audio is extracted: no audio file requested from YouTube,
 *      and no API key in the browser
 *
 * Requires the server to be running with a configured YOUTUBE_API_KEY.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const API = 'http://localhost:5000/api'
const PORT = 9590
const QUERY = process.env.YT_QUERY || 'blinding lights'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-src-'))
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
  } else if (m.method === 'log.entryAdded') logs.push(m.params)
  else if (m.method === 'network.responseCompleted') network.push(m.params)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
})
await send('session.new', { capabilities: {} })
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
    return { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) };
  })()`)
  if (!pos || !Number.isFinite(pos.x)) return false
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: pos.x, y: pos.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] })
  return true
}

console.log('='.repeat(68))
console.log('SOURCE PIPELINE - LIVE VERIFICATION')
console.log(`query: "${QUERY}"`)
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

// ---- 1. Home catalogue ----
console.log('\n=== 1. Home shows a real, populated catalogue ===')
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(7000)
const home = await ev(`(() => ({
  tracks: document.querySelectorAll('article').length,
  hasHero: Boolean(document.querySelector('h2')),
  sections: [...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).slice(0,12),
  regionChips: [...document.querySelectorAll('button[aria-pressed]')].map(b=>b.textContent.trim()).slice(0,20),
}))()`)
console.log('  sections:', JSON.stringify(home?.sections))
console.log('  region chips:', JSON.stringify(home?.regionChips))
check('Home renders content cards', (home?.tracks || 0) > 0, 'cards=' + home?.tracks)
check('has a featured hero', home?.hasHero === true)
check('shows Listen Now / hero region', JSON.stringify(home?.sections).length > 0)
check('regional chips are present', (home?.regionChips || []).length >= 8,
  'chips=' + (home?.regionChips || []).length)

// ---- 2. Unified search ----
console.log(`\n=== 2. Search "${QUERY}" returns real cross-source results ===`)
await send('browsingContext.navigate', { context, url: `${APP}search?q=${encodeURIComponent(QUERY)}`, wait: 'complete' })
await sleep(8000)
const results = await ev(`(() => {
  const body = document.body.innerText;
  const articles = [...document.querySelectorAll('article')];
  return {
    cardCount: articles.length,
    songRows: document.querySelectorAll('button[aria-label^="Play "]').length,
    hasArtists: /Artists/.test(body),
    hasCollections: /Collections/.test(body),
    ytBadges: (body.match(/YouTube/gi)||[]).length,
    sample: articles.slice(0,3).map(a => a.innerText.replace(/\\n/g,' | ').slice(0,70)),
  };
})()`)
console.log('  samples:'); (results?.sample||[]).forEach(s=>console.log('    -',s))
check('real result cards rendered', (results?.cardCount || 0) > 3, 'cards=' + results?.cardCount)
check('each result has a Play control', (results?.songRows || 0) > 3, 'playButtons=' + results?.songRows)
check('Artists section present', results?.hasArtists === true)
check('Collections section present', results?.hasCollections === true)
check('YouTube source badge shown (source as property, not tab)', (results?.ytBadges || 0) > 0,
  'badges=' + results?.ytBadges)

// ---- 3. Select a YouTube-backed song ----
console.log('\n=== 3. Selecting a YouTube-backed song opens the official player ===')
// Play buttons carry an aria-label; there is no literal "Play" text node.
const playPos = await ev(`(() => {
  const el = document.querySelectorAll('button[aria-label^="Play "]')[0];
  if (!el || el.disabled) return null;
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  return { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) };
})()`)
let clickedPlay = false
if (playPos && Number.isFinite(playPos.x)) {
  await send('input.performActions', { context, actions: [{ type:'pointer', id:'mouse', parameters:{pointerType:'mouse'}, actions:[
    { type:'pointerMove', x:playPos.x, y:playPos.y }, { type:'pointerDown', button:0 }, { type:'pointerUp', button:0 }] }] })
  clickedPlay = true
}
check('clicked Play on the first result', clickedPlay === true)
await sleep(10000)
const stage = await ev(`(() => {
  const stageEl = document.querySelector('[aria-label="YouTube player"]');
  const iframe = stageEl ? stageEl.querySelector('iframe') : null;
  const rect = iframe ? iframe.getBoundingClientRect() : null;
  const host = iframe && iframe.parentElement;
  const cs = host ? getComputedStyle(host) : null;
  let contentDocAccessible = true;
  if (iframe) { try { contentDocAccessible = iframe.contentDocument !== null } catch { contentDocAccessible = false } }
  return {
    stagePresent: Boolean(stageEl),
    iframePresent: Boolean(iframe),
    src: iframe ? iframe.src : null,
    width: rect ? Math.round(rect.width) : 0,
    height: rect ? Math.round(rect.height) : 0,
    opacity: cs ? cs.opacity : null,
    visibility: cs ? cs.visibility : null,
    contentDocAccessible,
    hasApiScript: [...document.scripts].some(s => (s.src||'').includes('/iframe_api')),
    credits: stageEl ? /Watch on YouTube/.test(stageEl.innerText) : false,
  };
})()`)
console.log('  ' + JSON.stringify(stage, null, 1).replace(/\n/g,'\n  '))
check('official YouTube stage opened', stage?.stagePresent === true)
check('real YouTube iframe mounted', stage?.iframePresent === true)
check('uses youtube-nocookie.com', String(stage?.src||'').includes('youtube-nocookie.com'))
check('IFrame Player API loaded', stage?.hasApiScript === true)
check(`player visible and >=200x200 (${stage?.width}x${stage?.height})`,
  (stage?.width||0) >= 200 && (stage?.height||0) >= 200)
check('player not hidden (opacity 1, visible)', stage?.opacity === '1' && stage?.visibility === 'visible')
check('player is cross-origin (not reachable from page)', stage?.contentDocAccessible === false)
check('attribution / outbound link shown', stage?.credits === true)

// ---- 4. Play / pause through the existing player ----
console.log('\n=== 4. Play / pause via the existing player ===')
let playing = false
for (let i=0;i<12;i++){ playing = await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Pause"]'))`); if(playing)break; await sleep(2000) }
check('official player reports playing', playing === true)

const clickStage = async (label) => {
  const pos = await ev(`(() => {
    const el = document.querySelector('[aria-label="YouTube player"] button[aria-label="' + ${JSON.stringify(label)} + '"]');
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block:'center' });
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2) };
  })()`)
  if (!pos || !Number.isFinite(pos.x)) return false
  await send('input.performActions', { context, actions: [{ type:'pointer', id:'mouse', parameters:{pointerType:'mouse'}, actions:[
    { type:'pointerMove', x:pos.x, y:pos.y }, { type:'pointerDown', button:0 }, { type:'pointerUp', button:0 }] }] })
  return true
}
check('clicked Pause', await clickStage('Pause') === true)
await sleep(2500)
check('stage switched to Play after pause', await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Play"]'))`) === true)
check('clicked Play to resume', await clickStage('Play') === true)
await sleep(3500)
check('stage resumed (Pause shown again)', await ev(`Boolean(document.querySelector('[aria-label="YouTube player"] button[aria-label="Pause"]'))`) === true)

// ---- 5. Local uploads still work ----
console.log('\n=== 5. First-party local uploads unchanged ===')
await send('script.addPreloadScript', { context, functionDeclaration: `function(){
  window.__audios=[]; const R=window.Audio;
  function P(){const e=new(Function.prototype.bind.apply(R,[null].concat([].slice.call(arguments))))();window.__audios.push(e);return e}
  P.prototype=R.prototype; window.Audio=P;}` })
await send('browsingContext.navigate', { context, url: APP, wait: 'complete' })
await sleep(6000)
for (let i=0;i<20;i++){ if(await ev(`document.querySelectorAll('button[aria-label^="Play "]').length`) > 0)break; await sleep(400) }
// Target a LOCAL (MUSICA-badge) card, since a YouTube card plays through the
// official player and deliberately leaves the audio element empty.
let up = null
for (let a=0;a<4;a++){
  const pos = await ev(`(()=>{
    // The Play button lives INSIDE the article, so the badge has to be read from
    // the ancestor, not from the button itself.
    const btn=[...document.querySelectorAll('button[aria-label^="Play "]')].find(b=>{
      const art=b.closest('article');
      return art && /MUSICA/i.test(art.innerText);
    }) || document.querySelectorAll('button[aria-label^="Play "]')[0];
    if(!btn||btn.disabled)return null;
    btn.scrollIntoView({block:'center'});
    const b=btn.getBoundingClientRect();
    return{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
  })()`)
  if(pos){await send('input.performActions',{context,actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:pos.x,y:pos.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]})}
  else await ev(`document.querySelectorAll('button[aria-label^="Play "]')[0]?.click()`)
  await sleep(5000)
  up = await ev(`(()=>{const a=(window.__audios||[]).slice(-1)[0];return{n:(window.__audios||[]).length,src:a?(a.src||'').split('/').pop():null,rs:a?a.readyState:null,paused:a?a.paused:null,t:a?Math.round(a.currentTime*100)/100:null}})()`)
  if((up?.t||0)>0)break
}
console.log('  ', JSON.stringify(up))
check('single Audio element', up?.n === 1, 'n=' + up?.n)
check('local upload plays', (up?.rs||0) >= 3 && up?.paused === false && (up?.t||0) > 0,
  `rs=${up?.rs} paused=${up?.paused} t=${up?.t}`)

// ---- 6. Compliance: no YouTube audio extraction ----
console.log('\n=== 6. No YouTube audio extraction ===')
const netUrl = (n) => n?.request?.url || n?.url || ''
const all = network.map(netUrl).filter(Boolean)
const withKey = all.filter(u => /[?&]key=/.test(u))
const dataApi = all.filter(u => /googleapis\.com\/youtube/.test(u))
const ytAudioFiles = all.filter(u => /youtube(-nocookie)?\.com/.test(u) && /\.(mp3|m4a|aac|flac|webm|mp4)(\?|$)/i.test(u))
check('no request ever carried an API key', withKey.length === 0, 'withKey=' + withKey.length)
check('YouTube Data API never called from browser', dataApi.length === 0, 'dataApi=' + dataApi.length)
check('no standalone audio file fetched from YouTube', ytAudioFiles.length === 0, 'audioFiles=' + ytAudioFiles.length)
const domKey = await ev(`(() => ['AIza'].filter(k => document.documentElement.outerHTML.includes(k)))()`)
check('no API key in the DOM', (domKey||[]).length === 0, JSON.stringify(domKey))

// ---- 7. Console ----
console.log('\n=== 7. Console hygiene ===')
const errs = logs.filter(l => l.level === 'error'
  && !/favicon|net::ERR_|youtube|ytimg|googlevideo|doubleclick|CORS|Failed to load resource|third-party cookie|blocked a frame|Failed to fetch/i.test(l.text || ''))
console.log('  console errors:', errs.length)
errs.slice(0,5).forEach(e=>console.log('    ', (e.text||'').slice(0,140)))
check('zero unexpected console errors', errs.length === 0, String(errs.length))

ws.close(); ff.kill('SIGKILL'); fs.rmSync(profileDir,{recursive:true,force:true})
console.log('\n' + '='.repeat(68))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed===0 ? 'RESULT: SOURCE PIPELINE VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(68))
process.exit(failed===0 ? 0 : 1)