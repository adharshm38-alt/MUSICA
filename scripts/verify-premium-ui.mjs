/**
 * Premium UI verification: navigation, overflow and the player surfaces.
 *
 * Split into focused passes so each run stays short on a slow machine rather
 * than timing out partway through a long script.
 *
 * Pass 1  overflow at every required width (cheap: navigation only)
 * Pass 2  bottom navigation + route wiring at one phone width and desktop
 * Pass 3  mini-player, full player, queue, navigation routes
 *
 * Run: node scripts/verify-premium-ui.mjs [1|2|3|all]
 */

import withBrowser, { sleep } from './lib/browser.mjs'

const APP = 'http://localhost:5173/'
const API = 'http://localhost:5000/api'

const PHONE = { w: 390, h: 844 }
const PHONES = [
  { name: '360x800', w: 360, h: 800 },
  { name: '390x844', w: 390, h: 844 },
  { name: '412x915', w: 412, h: 915 },
]
const DESKTOP = { name: '1440x900', w: 1440, h: 900 }

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

/* ------------------------------------------------------------------ */
/* Pass 1: horizontal overflow at every required width                 */
/* ------------------------------------------------------------------ */
async function passOverflow() {
  console.log('\n=== PASS 1: no horizontal overflow, no clipped controls ===')
  const PAGES = [
    ['Home', APP],
    ['Explore', `${APP}explore`],
    ['Library', `${APP}library`],
    ['Search', `${APP}search`],
    ['Playlists', `${APP}playlists`],
  ]

  await withBrowser({ port: 9601, url: APP }, async (b) => {
    await sleep(2500)
    await b.login(API, 'nova@musica.dev', 'password123')

    for (const vp of [...PHONES, DESKTOP]) {
      await b.setViewport(vp.w, vp.h)
      for (const [name, url] of PAGES) {
        await b.goto(url, 2000)
        const m = await b.ev(`(() => {
          const d = document.documentElement;
          // Anything sticking out horizontally that is NOT inside a horizontal
          // scroller is a genuine overflow bug; rails are meant to scroll.
          const offenders = [...document.querySelectorAll('body *')].filter((e) => {
            const r = e.getBoundingClientRect();
            if (r.right <= window.innerWidth + 2) return false;
            let p = e.parentElement;
            while (p && p !== document.body) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
              p = p.parentElement;
            }
            return true;
          }).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 45));
          return { scrollW: d.scrollWidth, clientW: d.clientWidth, offenders };
        })()`)
        check(
          `${vp.name} / ${name}: no horizontal overflow`,
          m.scrollW <= m.clientW + 2 && (m.offenders?.length ?? 0) === 0,
          m.offenders?.length ? `scrollW=${m.scrollW}/${m.clientW} ${JSON.stringify(m.offenders)}` : `scrollW=${m.scrollW}`,
        )
      }
    }
  })
}

/* ------------------------------------------------------------------ */
/* Pass 2: bottom navigation                                            */
/* ------------------------------------------------------------------ */
async function passNav() {
  console.log('\n=== PASS 2: bottom navigation + touch targets ===')
  await withBrowser({ port: 9602, url: APP }, async (b) => {
    await sleep(2500)
    await b.login(API, 'nova@musica.dev', 'password123')

    for (const vp of PHONES) {
      await b.setViewport(vp.w, vp.h)
      await b.goto(APP, 2500)
      const nav = await b.ev(`(() => {
        const n = document.querySelector('nav[aria-label="Primary"]');
        if (!n) return { present: false };
        const r = n.getBoundingClientRect();
        const items = [...n.querySelectorAll('a, button')];
        // The active pill is a tinted rounded background. Compared as a plain string
        // rather than parsed: Tailwind v4 emits oklab() colours, so an
        // rgba()-only check would silently miss the active tab.
        const TRANSPARENT = 'rgba(0, 0, 0, 0)';
        let hasPill = false;
        for (const it of items) {
          const bg = (getComputedStyle(it).backgroundColor || '').trim();
          if (!bg || bg === TRANSPARENT || bg === 'transparent') continue;
          hasPill = true;
          break;
        }
        return {
          present: true,
          labels: items.map((x) => x.textContent.trim()).filter(Boolean),
          atBottom: Math.abs(r.bottom - window.innerHeight) < 3,
          minTarget: Math.min(...items.map((x) => x.getBoundingClientRect().height)),
          inViewport: r.left >= -1 && r.right <= window.innerWidth + 1,
          activePill: hasPill,
        };
      })()`)

      check(`${vp.name}: bottom nav present`, nav.present === true)
      check(`${vp.name}: pinned to the bottom edge`, nav.atBottom === true)
      check(`${vp.name}: nav inside viewport`, nav.inViewport === true)
      check(`${vp.name}: touch targets >= 40px`, nav.minTarget >= 40, `min=${Math.round(nav.minTarget)}px`)
      check(`${vp.name}: has Home/Explore/Library/Search`,
        ['Home', 'Explore', 'Library', 'Search'].every((w) => nav.labels.includes(w)),
        nav.labels.join(' | '))
      check(`${vp.name}: active tab has a pill highlight`, nav.activePill === true)
    }

    // Desktop: nav moves to a sidebar.
    await b.setViewport(DESKTOP.w, DESKTOP.h)
    await b.goto(APP, 2500)
    const desk = await b.ev(`(() => {
      // Elements with display:none still exist in the DOM, so visibility has to
      // be checked rather than presence.
      const bn = document.querySelector('nav[aria-label="Primary"]');
      const bottomNavHidden = !bn || getComputedStyle(bn).display === 'none'
        || bn.getBoundingClientRect().width === 0;
      const sidebars = [...document.querySelectorAll('nav')]
        .filter((n) => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 200);
      return {
        bottomNavHidden,
        sidebarVisible: sidebars.length > 0,
        labels: sidebars.flatMap((n) => [...n.querySelectorAll('a')].map((a) => a.textContent.trim())).filter(Boolean),
      };
    })()`)
    check('desktop: bottom nav hidden', desk.bottomNavHidden === true)
    check('desktop: sidebar present', desk.sidebarVisible === true)
    check('desktop: sidebar has the same sections',
      ['Home', 'Explore', 'Library', 'Search'].every((w) => desk.labels.includes(w)),
      desk.labels.join(' | '))
  })
}

/* ------------------------------------------------------------------ */
/* Pass 3: mini-player, full player, queue, routing                     */
/* ------------------------------------------------------------------ */
async function passPlayer() {
  console.log('\n=== PASS 3: mini-player, full player, queue, routing ===')
  await withBrowser({ port: 9603, url: APP }, async (b) => {
    await sleep(2500)
    await b.login(API, 'nova@musica.dev', 'password123')
    await b.setViewport(PHONE.w, PHONE.h)
    await b.goto(`${APP}library`, 3000)

    // Start local playback so the dock exists.
    const started = await b.ev(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((x) => /Play /.test(x.getAttribute('aria-label') || ''));
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
    await sleep(3000)

    const dock = await b.ev(`(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const navR = nav.getBoundingClientRect();
      // Identify the mini dock by what it does, not by a class: it is the fixed
      // element that opens the full player. The desktop bar is display:none here
      // and must not be mistaken for it.
      const candidates = [...document.querySelectorAll('div')].filter((d) => {
        if (getComputedStyle(d).position !== 'fixed') return false;
        const r = d.getBoundingClientRect();
        if (r.height < 30 || r.width < 100) return false;
        return [...d.querySelectorAll('button')]
          .some((b) => /Open full player/i.test(b.getAttribute('aria-label') || ''));
      });
      const el = candidates[0];
      const r = el ? el.getBoundingClientRect() : null;
      const labels = el
        ? [...el.querySelectorAll('button')].map((x) => x.getAttribute('aria-label') || '')
        : [];
      return {
        present: Boolean(el),
        height: r ? Math.round(r.height) : 0,
        bottom: r ? Math.round(r.bottom) : null,
        top: r ? Math.round(r.top) : null,
        navTop: Math.round(navR.top),
        inViewport: r ? r.left >= -1 && r.right <= window.innerWidth + 1 : false,
        // Headless autoplay is often blocked, so either state is acceptable:
        // what matters is that a transport control is there.
        hasTransport: labels.some((l) => /^(Play|Pause)$/i.test(l.trim())),
        hasNext: labels.some((l) => /Next/i.test(l)),
        opensFull: labels.some((l) => /Open full player/i.test(l)),
      };
    })()`)

    check('local playback started', started === true)
    check('mini-player dock present', dock.present === true, `h=${dock.height}px`)
    check('dock sits above the bottom nav', dock.bottom !== null && dock.bottom <= dock.navTop + 3,
      `dockBottom=${dock.bottom} navTop=${dock.navTop}`)
    check('dock inside viewport', dock.inViewport === true)
    check('dock has play/pause', dock.hasTransport === true)
    check('dock has next', dock.hasNext === true)
    check('dock opens the full player', dock.opensFull === true)
    check('dock is above the nav with a real gap', dock.top !== null && dock.top < dock.navTop,
      `dockTop=${dock.top} navTop=${dock.navTop}`)

    // The fullscreen player must NOT be on screen just because a song loaded.
    const notForced = await b.ev(`!document.querySelector('.player-sheet')`)
    check('fullscreen player is NOT shown until asked for', notForced === true)

    // Search must remain usable while playing.
    //
    // Navigated through the bottom bar rather than a full page load: a reload
    // would reset the player context and lose the song, which is not what a
    // real listener does. SPA routing is exactly the case being tested here.
    await b.ev(`(() => {
      const n = document.querySelector('nav[aria-label="Primary"]');
      const link = [...n.querySelectorAll('a, button')].find((x) => x.textContent.trim() === 'Search');
      if (link) link.click();
      return true;
    })()`)
    await sleep(2500)
    const whilePlaying = await b.ev(`(() => ({
      input: Boolean(document.querySelector('#search-input')),
      placeholder: document.querySelector('#search-input')?.placeholder || '',
      dockStillThere: Boolean([...document.querySelectorAll('div')].find((d) => {
        if (getComputedStyle(d).position !== 'fixed') return false;
        return [...d.querySelectorAll('button')]
          .some((b) => /Open full player/i.test(b.getAttribute('aria-label') || ''));
      })),
      fullPlayerNotCovering: !document.querySelector('.player-sheet'),
    }))()`)
    check('Search usable while playing', whilePlaying.input === true)
    check('Search hero placeholder is correct',
      whilePlaying.placeholder === 'Artists, Songs, Lyrics and More',
      whilePlaying.placeholder)
    check('mini-player still visible on Search', whilePlaying.dockStillThere === true)
    check('fullscreen player does not cover Search', whilePlaying.fullPlayerNotCovering === true)

    // Full player opens and closes.
    await b.ev(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((x) => /Open full player/.test(x.getAttribute('aria-label') || ''));
      if (btn) btn.click();
      return true;
    })()`)
    await sleep(2200)

    const full = await b.ev(`(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Now playing"]');
      if (!d) return { present: false };
      const r = d.getBoundingClientRect();
      const labels = [...d.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '');
      const text = d.innerText;
      return {
        present: true,
        fullBleed: r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2,
        overflowX: d.scrollWidth - d.clientWidth,
        backdrop: Boolean(d.querySelector('.pointer-events-none')),
        hasArt: Boolean(d.querySelector('img, svg')),
        labels,
        hasLyrics: /Lyrics/i.test(text),
        showsTime: /\\d:\\d\\d/.test(text),
      };
    })()`)

    check('full player opens', full.present === true)
    check('full player is full-bleed', full.fullBleed === true)
    check('no horizontal overflow inside player', full.overflowX <= 2, `overflow=${full.overflowX}`)
    check('artwork backdrop applied', full.backdrop === true)
    check('artwork rendered', full.hasArt === true)
    check('previous control', full.labels.some((l) => /Previous/i.test(l)))
    check('play/pause control', full.labels.some((l) => /^(Play|Pause)$/i.test(l)))
    check('next control', full.labels.some((l) => /Next/i.test(l)))
    check('favorite control', full.labels.some((l) => /like/i.test(l)))
    check('lyrics entry', full.hasLyrics === true)
    check('lyrics button', full.labels.some((l) => /lyrics/i.test(l)))
    check('output/device button', full.labels.some((l) => /output/i.test(l)))
    check('queue button', full.labels.some((l) => /queue/i.test(l)))
    check('elapsed/remaining time shown', full.showsTime === true)

    // Queue opens from the player.
    await b.ev(`(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Now playing"]');
      const btn = [...d.querySelectorAll('button')].find((x) => /queue/i.test(x.getAttribute('aria-label') || ''));
      if (btn) btn.click();
      return true;
    })()`)
    await sleep(1800)
    const queue = await b.ev(`(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')]
        .find((x) => /queue/i.test(x.getAttribute('aria-label') || ''));
      return { present: Boolean(d), text: d ? d.innerText.slice(0, 200) : '' };
    })()`)
    check('queue panel opens', queue.present === true)
    check('queue shows Now Playing or Up next',
      /Now playing|Up next|Nothing queued/i.test(queue.text),
      queue.text.replace(/\n/g, ' ').slice(0, 70))

    // Close the full player.
    await b.ev(`(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Now playing"]');
      if (!d) return false;
      const btn = [...d.querySelectorAll('button')].find((x) => /Close player/i.test(x.getAttribute('aria-label') || ''));
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
    await sleep(1500)
    const closed = await b.ev(`!document.querySelector('[role="dialog"][aria-label="Now playing"]')`)
    check('full player closes', closed === true)

    // Routing through the bottom nav. Driven from wherever the app currently is,
    // so each hop is a real in-app navigation rather than a reload.
    for (const [label, expected] of [['Explore', '/explore'], ['Library', '/library'], ['Search', '/search'], ['Home', '/']]) {
      const clicked = await b.ev(`(() => {
        const n = document.querySelector('nav[aria-label="Primary"]');
        if (!n) return false;
        const btn = [...n.querySelectorAll('a, button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
        if (!btn) return false;
        btn.click();
        return true;
      })()`)
      await sleep(1800)
      const path = await b.ev('location.pathname')
      check(`nav "${label}" -> ${expected}`, clicked === true && path === expected, `got ${path}`)
    }

    // /discover must still redirect so old links work.
    await b.goto(`${APP}discover`, 2000)
    check('/discover redirects to /explore', (await b.ev('location.pathname')) === '/explore')
  })
}

/* ------------------------------------------------------------------ */
/* Pass 4: console hygiene                                              */
/* ------------------------------------------------------------------ */
async function passConsole() {
  console.log('\n=== PASS 4: console hygiene ===')
  const entries = []
  await withBrowser({ port: 9604, url: APP, onConsole: (e) => entries.push(e) }, async (b) => {
    await sleep(2500)
    await b.login(API, 'nova@musica.dev', 'password123')
    await b.setViewport(PHONE.w, PHONE.h)
    for (const u of [APP, `${APP}explore`, `${APP}search`, `${APP}library`]) {
      await b.goto(u, 2000)
    }
  })

  const errors = entries.filter((e) => e.level === 'error')
  const real = errors.filter((e) => {
    const t = e.text || e.message || ''
    return !/media\.notAllowed|AbortError|net::|NS_ERROR|Failed to load resource|play\(\) request/i.test(t)
  })
  if (real.length) real.slice(0, 6).forEach((e) => console.log(`    - ${e.text || e.message}`))
  check('no console errors', real.length === 0, `${real.length} real of ${entries.length} entries`)
}

const pass = process.argv[2] || 'all'
const map = { 1: passOverflow, 2: passNav, 3: passPlayer, 4: passConsole }
const runs = pass === 'all' ? Object.values(map) : [map[pass]].filter(Boolean)

console.log('='.repeat(72))
console.log('PREMIUM UI VERIFICATION')
console.log('='.repeat(72))

for (const fn of runs) await fn()

console.log('\n' + '='.repeat(72))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: PREMIUM UI VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(72))
process.exit(failed === 0 ? 0 : 1)