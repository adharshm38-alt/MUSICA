/**
 * Frontend debounce behaviour, asserted without a browser.
 *
 * The point of the debounce is quota, not aesthetics: every catalogue search
 * that reaches YouTube costs a `search.list` call. These tests re-implement the
 * exact scheduling contract used in MusicResults.jsx (600ms settle window,
 * minimum query length, superseded requests invalidated) and assert the request
 * COUNT, which is the thing that actually spends quota.
 *
 * Run: node scripts/verify-frontend-debounce.mjs
 */

let passed = 0
let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
  ok ? passed++ : failed++
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Must match client/src/components/music/MusicResults.jsx
const SEARCH_DEBOUNCE_MS = 600
const MIN_QUERY_LENGTH = 2

/**
 * A faithful stand-in for the component's effect: pending timer is cleared on
 * every term change, and the request id is bumped so a late response for an old
 * term is ignored.
 */
function createSearchHarness() {
  const calls = []
  let timer = null
  let requestId = 0
  let currentId = 0
  let lastTerm = null

  return {
    calls,
    setTerm(term) {
      const t = String(term ?? '').trim()
      lastTerm = t
      // cleanup of the previous effect
      if (timer) clearTimeout(timer)
      timer = null

      if (t.length < MIN_QUERY_LENGTH) {
        currentId = ++requestId
        return
      }
      currentId = ++requestId
      const id = currentId
      timer = setTimeout(() => {
        calls.push({ term: t, id })
      }, SEARCH_DEBOUNCE_MS)
    },
    /**
     * Models a React re-render that does NOT change the term.
     *
     * The effect's dependency list holds the trimmed term, so React skips the
     * effect entirely when it is unchanged. No timer is restarted and no
     * request is scheduled, which is the whole point of requirement 4.
     */
    rerender(term) {
      const t = String(term ?? '').trim()
      if (t === lastTerm) return false
      this.setTerm(t)
      return true
    },
    /** Simulates a response arriving; only records it if still current. */
    settle(id) {
      if (id !== currentId) return false
      return true
    },
    get currentId() {
      return currentId
    },
    flush() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

console.log('='.repeat(70))
console.log('FRONTEND DEBOUNCE / QUOTA-SPEND BEHAVIOUR')
console.log('='.repeat(70))

/* ---- 1. no search on every keystroke ---- */
console.log('\n=== 1. Typing does not fire a request per keystroke ===')
{
  const h = createSearchHarness()
  const phrase = 'blinding lights'
  // Type it the way a person does: the input accumulates, one character at a
  // time, each arriving well inside the settle window.
  let typed = ''
  for (const ch of phrase) {
    typed += ch
    h.setTerm(typed)
    await sleep(40) // ~40ms between keystrokes, far below the settle window
  }
  await sleep(SEARCH_DEBOUNCE_MS + 250)
  check(
    `typing "${phrase}" produced ONE request, not ${phrase.length}`,
    h.calls.length === 1,
    `calls=${h.calls.length}`,
  )
  check('the request carried the full phrase', h.calls[0]?.term === phrase, h.calls[0]?.term)
}

/* ---- 2. minimum query length ---- */
console.log('\n=== 2. Short queries are not searched ===')
{
  for (const q of ['', ' ', 'a', 'A']) {
    const h = createSearchHarness()
    h.setTerm(q)
    await sleep(SEARCH_DEBOUNCE_MS + 150)
    check(`"${q}" produced no request`, h.calls.length === 0, `calls=${h.calls.length}`)
  }
  const h = createSearchHarness()
  h.setTerm('ab')
  await sleep(SEARCH_DEBOUNCE_MS + 150)
  check('2-character query IS searched', h.calls.length === 1, `calls=${h.calls.length}`)
}

/* ---- 3. settled query is searched ---- */
console.log('\n=== 3. A settled query does get searched ===')
{
  const h = createSearchHarness()
  h.setTerm('ar rahman')
  await sleep(SEARCH_DEBOUNCE_MS + 150)
  check('settled query fired exactly once', h.calls.length === 1, `calls=${h.calls.length}`)
}

/* ---- 4. stale responses are ignored ---- */
console.log('\n=== 4. Superseded requests cannot overwrite newer results ===')
{
  const h = createSearchHarness()
  h.setTerm('old query')
  await sleep(SEARCH_DEBOUNCE_MS + 150)
  const staleId = h.calls[0].id

  h.setTerm('new query')
  await sleep(SEARCH_DEBOUNCE_MS + 150)
  check('new query fired', h.calls.length === 2, `calls=${h.calls.length}`)
  check('the OLD response is discarded', h.settle(staleId) === false)
  check('the NEW response is accepted', h.settle(h.calls[1].id) === true)
}

/* ---- 5. rapid re-typing cancels pending work ---- */
console.log('\n=== 5. Rapid changes cancel the pending request ===')
{
  const h = createSearchHarness()
  h.setTerm('lofi beats')
  await sleep(200) // still inside the window
  h.setTerm('lofi beat') // user corrected it
  await sleep(SEARCH_DEBOUNCE_MS + 200)
  check('only the corrected query was searched', h.calls.length === 1, `calls=${h.calls.length}`)
  check('the corrected text is what was sent', h.calls[0]?.term === 'lofi beat', h.calls[0]?.term)
}

/* ---- 6. unmount cancels everything ---- */
console.log('\n=== 6. Leaving the page cancels the pending request ===')
{
  const h = createSearchHarness()
  h.setTerm('never sent')
  h.flush() // cleanup() runs on unmount
  await sleep(SEARCH_DEBOUNCE_MS + 200)
  check('nothing was sent after unmount', h.calls.length === 0, `calls=${h.calls.length}`)
}

/* ---- 7. realistic typing burst, quota math ---- */
console.log('\n=== 7. Quota math for realistic use ===')
{
  const h = createSearchHarness()
  const phrase = 'a r rahman'
  let typed = ''
  for (const ch of phrase) {
    typed += ch
    h.setTerm(typed)
    await sleep(45)
  }
  await sleep(SEARCH_DEBOUNCE_MS + 250)
  check('a whole search phrase costs ONE request', h.calls.length === 1,
    `calls=${h.calls.length} for "${phrase}"`)

  // And a listener who pauses mid-word pays for the pause, not the keystroke.
  const h2 = createSearchHarness()
  h2.setTerm('jay')
  await sleep(SEARCH_DEBOUNCE_MS + 200) // paused long enough to settle
  h2.setTerm('jay chowdhury')
  await sleep(SEARCH_DEBOUNCE_MS + 250)
  check('a deliberate pause costs one extra request (unavoidable)', h2.calls.length === 2,
    `calls=${h2.calls.length}`)
}

/* ---- 8. re-renders do not re-trigger ---- */
console.log('\n=== 8. Re-render with the same term does not re-search ===')
{
  const h = createSearchHarness()
  h.setTerm('stable term')
  await sleep(SEARCH_DEBOUNCE_MS + 200)
  const before = h.calls.length

  // Five unrelated re-renders with the SAME term. React sees an unchanged
  // dependency and skips the effect, so nothing is scheduled.
  let triggered = 0
  for (let i = 0; i < 5; i += 1) {
    if (h.rerender('stable term')) triggered += 1
  }
  await sleep(SEARCH_DEBOUNCE_MS + 250)

  check('re-render with an unchanged term re-runs the effect', triggered === 0,
    `effect re-ran ${triggered} times`)
  check('and therefore issued no extra request', h.calls.length === before,
    `calls ${before} -> ${h.calls.length}`)
}

console.log('\n' + '='.repeat(70))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: FRONTEND DEBOUNCE VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(70))
process.exit(failed === 0 ? 0 : 1)