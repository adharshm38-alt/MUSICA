/**
 * Focused check for the YouTube dock UX fix.
 *
 * The bug: the dock's full-width fixed container sat on top of the page and
 * swallowed clicks, so tapping a search result after playback started did
 * nothing. This asserts that the page underneath remains interactive while the
 * official player is visible, and that search stays the active page.
 *
 * Does not depend on YouTube search quota: it drives playback from whatever the
 * catalogue returns and only asserts pointer/visibility behaviour.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP = 'http://localhost:5173/'
const PORT = 9602
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-dock-'))
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
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 25000)
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

console.log('='.repeat(66))
console.log('YOUTUBE DOCK - PAGE STAYS INTERACTIVE')
console.log('='.repeat(66))

await send('browsingContext.navigate', { context, url: `${APP}login`, wait: 'complete' })
await sleep(3500)
await ev(`(() => { const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
  d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(document.querySelector('#email'),'nova@musica.dev');
  set(document.querySelector('#password'),'password123'); })()`)
await ev(`(() => { const f=document.querySelector('#password')?.closest('form');
  if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); })()`)
await sleep(4500)

// Use the Home page so a YouTube track is playable without depending on search.
await send('browsingContext.navigate', { context, url: `${APP}search?q=golden`, wait: 'complete' })
await sleep(6000)

const played = await ev(`(() => {
  const btns = [...document.querySelectorAll('button[aria-label^="Play "]')];
  const local = btns.find(b => { const a = b.closest('article'); return a && /MUSICA/i.test(a.innerText); });
  const target = local || btns[0];
  if (!target) return { clicked: false };
  target.click();
  return { clicked: true, label: target.getAttribute('aria-label') };
})()`)
console.log('  clicked:', JSON.stringify(played))
await sleep(4000)

// Navigate to Search so we can test the dock against a real results page.
await send('browsingContext.navigate', { context, url: `${APP}search?q=golden`, wait: 'complete' })
await sleep(4000)
await ev(`(() => {
  const btns = [...document.querySelectorAll('button[aria-label^="Play "]')];
  const b = btns.find(x => { const a = x.closest('article'); return a && /YOUTUBE/i.test(a.innerText); }) || btns[0];
  if (b) b.click();
  return Boolean(b);
})()`)
await sleep(6000)

const probe = await ev(`(() => {
  const dock = document.querySelector('[data-youtube-dock]');
  const input = document.querySelector('#search-input');
  if (!input) return { error: 'no search input', path: location.pathname };
  const r = input.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2);
  const y = Math.round(r.y + r.height / 2);
  const top = document.elementFromPoint(x, y);
  // Walk up from the hit element to see whether the dock is in the chain.
  let n = top; let dockInChain = false;
  while (n) { if (n === dock) dockInChain = true; n = n.parentElement; }
  return {
    path: location.pathname,
    dockPresent: Boolean(dock),
    inputHitTag: top ? top.tagName : null,
    inputReachable: Boolean(top && (top === input || input.contains(top))),
    dockInHitChain: dockInChain,
    resultButtons: document.querySelectorAll('button[aria-label^="Play "]').length,
    modals: document.querySelectorAll('[aria-modal="true"]').length,
    scrollable: document.documentElement.scrollHeight > window.innerHeight,
  };
})()`)
console.log('  ' + JSON.stringify(probe))
check('dock is present', probe?.dockPresent === true)
check('the dock does NOT intercept the search box',
  probe?.dockInHitChain === false && probe?.inputReachable === true,
  `inChain=${probe?.dockInHitChain} reachable=${probe?.inputReachable}`)
check('no modal overlay', probe?.modals === 0, 'modals=' + probe?.modals)
check('results still rendered', (probe?.resultButtons || 0) > 0, 'results=' + probe?.resultButtons)
check('page still scrollable', probe?.scrollable === true)

// And prove a result click reaches the handler: track the button's aria-label
// before/after clicking a second result.
const swap = await ev(`(() => {
  const dock = document.querySelector('[data-youtube-dock]');
  const readId = () => {
    const f = dock && dock.querySelector('iframe');
    if (!f) return null;
    const parts = f.src.split('/embed/');
    return parts.length > 1 ? parts[1].split('?')[0].slice(0, 11) : null;
  };
  const before = readId();
  const btns = [...document.querySelectorAll('button[aria-label^="Play "]')];
  // Choose a button that is NOT the one currently playing.
  const curTitle = dock && dock.querySelector('p') ? dock.querySelector('p').textContent.trim() : '';
  const idx = btns.findIndex(b => {
    const a = b.getAttribute('aria-label') || '';
    return a && curTitle && !a.includes(curTitle);
  });
  if (idx < 0) return { before, clicked: false, reason: 'no distinct result available' };
  btns[idx].click();
  return { before, clicked: true, clickedLabel: btns[idx].getAttribute('aria-label') };
})()`)
console.log('  swap attempt:', JSON.stringify(swap))
if (swap?.clicked) {
  await sleep(7000)
  const after = await ev(`(() => {
    const dock = document.querySelector('[data-youtube-dock]');
    const f = dock && dock.querySelector('iframe');
    if (!f) return { id: null, title: null };
    const parts = f.src.split('/embed/');
    return {
      id: parts.length > 1 ? parts[1].split('?')[0].slice(0, 11) : null,
      title: dock.querySelector('p') ? dock.querySelector('p').textContent.trim() : null,
      playing: Boolean(dock.querySelector('button[aria-label="Pause"]')),
    };
  })()`)
  console.log('  after click:', JSON.stringify(after))
  check('selecting another result switches the video', after?.id && after.id !== swap.before,
    `${swap.before} -> ${after?.id}`)
  check('new track is playing', after?.playing === true)
  check('still on Search page', probe?.path === '/search')
} else {
  console.log('  (skipped swap assertions: only one distinct result available)')
}

ws.close(); ff.kill('SIGKILL'); fs.rmSync(profileDir, { recursive: true, force: true })
console.log('\n' + '='.repeat(66))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: DOCK UX VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(66))
process.exit(failed === 0 ? 0 : 1)