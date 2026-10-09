/**
 * CORS regression tests for the packaged Android app.
 *
 * Root cause these guard against: Capacitor serves the Android WebView from
 * https://localhost, not from the web frontend URL. CLIENT_URL only ever lists
 * real websites, so the app's origin was missing from the allowlist. The API
 * still answered - with a perfectly good 401/200 - but WITHOUT
 * Access-Control-Allow-Origin, so the WebView discarded the response. axios saw
 * no response at all and the app reported "MUSICA server is waking up" while the
 * server was perfectly healthy.
 *
 * Run: node scripts/verify-cors.mjs
 */

let passed = 0
let failed = 0
const check = (l, p, d = '') => {
  console.log(`  ${p ? 'PASS' : 'FAIL'}  ${l}${d ? '  -> ' + d : ''}`)
  p ? passed++ : failed++
}

const { resolveAllowedOrigin } = await import('../server/src/app.js')
// Imported up front so the CLIENT_URL-dependent assertions below can use it.
const { default: envConfig } = await import('../server/src/config/env.js')

console.log('='.repeat(70))
console.log('CORS ORIGIN ALLOWLIST')
console.log('='.repeat(70))

const WEB = 'https://adharshm38-musica-web.onrender.com'
const CLIENT_URL = `${WEB},http://localhost:5173`

console.log('\n=== 1. The packaged app origin must be allowed ===')
for (const origin of ['https://localhost', 'http://localhost', 'capacitor://localhost']) {
  check(`allows ${origin}`, resolveAllowedOrigin(origin, CLIENT_URL) === origin,
    `got ${JSON.stringify(resolveAllowedOrigin(origin, CLIENT_URL))}`)
}

console.log('\n=== 2. Web and local-dev origins still allowed ===')
check('allows the production web frontend', resolveAllowedOrigin(WEB, CLIENT_URL) === WEB)
check('allows the local Vite dev server', resolveAllowedOrigin('http://localhost:5173', CLIENT_URL) === 'http://localhost:5173')
check('supports multiple configured origins', resolveAllowedOrigin(WEB, CLIENT_URL) === WEB)

console.log('\n=== 3. Unknown origins are refused (security) ===')
for (const origin of [
  'https://evil.example',
  'https://localhost.attacker.example',
  'https://notlocalhost',
  'http://localhost:5173.evil.example',
  'https://musica-web.onrender.com.evil.example',
]) {
  const result = resolveAllowedOrigin(origin, CLIENT_URL)
  check(`refuses ${origin}`, result === false, `got ${JSON.stringify(result)}`)
}

console.log('\n=== 4. Missing / malformed Origin ===')
check('missing Origin -> refused', resolveAllowedOrigin(undefined, CLIENT_URL) === false)
check('empty Origin -> refused', resolveAllowedOrigin('', CLIENT_URL) === false)
check('null Origin -> refused', resolveAllowedOrigin(null, CLIENT_URL) === false)

console.log('\n=== 5. Matching is case-insensitive, but the echo must be byte-exact ===')
// A browser only accepts Access-Control-Allow-Origin when it matches the Origin
// it sent, so the request's own spelling has to be returned.
check('uppercase request matches the allowlist', resolveAllowedOrigin('HTTPS://LOCALHOST', CLIENT_URL) === 'HTTPS://LOCALHOST',
  `got ${JSON.stringify(resolveAllowedOrigin('HTTPS://LOCALHOST', CLIENT_URL))}`)
check('trailing slash does not match', resolveAllowedOrigin('https://localhost/', CLIENT_URL) === false)
check('port must match exactly', resolveAllowedOrigin('https://localhost:8443', CLIENT_URL) === false)

console.log('\n=== 6. Works with no CLIENT_URL configured ===')
const noConfig = resolveAllowedOrigin('https://localhost', undefined)
check('native origin allowed even with CLIENT_URL unset', noConfig === 'https://localhost',
  `got ${JSON.stringify(noConfig)}`)
check('web origin refused when not configured', resolveAllowedOrigin(WEB, undefined) === false)

console.log('\n=== 6c. Called with ONE argument, falls back to CLIENT_URL ===')
// Regression guard. With no list supplied the resolver must fall back to the
// configured CLIENT_URL. Defaulting to undefined instead would silently drop
// every configured web origin and quietly allow only the native ones.
const configuredList = String(envConfig.clientUrl || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
for (const webOrigin of configuredList) {
  check(`one-arg form allows configured web origin ${webOrigin}`,
    resolveAllowedOrigin(webOrigin) === webOrigin,
    `got ${JSON.stringify(resolveAllowedOrigin(webOrigin))}`)
}
check('one-arg form still allows the native app origin',
  resolveAllowedOrigin('https://localhost') === 'https://localhost')
check('one-arg form still refuses an unknown origin',
  resolveAllowedOrigin('https://evil.example') === false)

console.log('\n=== 6b. Supports the `cors` callback convention ===')
// The `cors` package calls origin(origin, callback) and WAITS for the callback.
// A resolver that ignores it hangs every request forever. This is the exact bug
// that made /api/health time out, so it is asserted directly.
const callWithCallback = (origin) => {
  let called = false
  let error
  let value
  resolveAllowedOrigin(origin, (err, allow) => {
    called = true
    error = err
    value = allow
  })
  return { called, error, value }
}

const cbAllowed = callWithCallback('https://localhost')
check('callback IS invoked for an allowed origin', cbAllowed.called === true)
check('callback receives no error', cbAllowed.error === null || cbAllowed.error === undefined)
check('callback allows the origin', cbAllowed.value === 'https://localhost', JSON.stringify(cbAllowed.value))

const cbRefused = callWithCallback('https://evil.example')
check('callback IS invoked for a refused origin', cbRefused.called === true)
check('refused origin yields false (no ACAO emitted)', cbRefused.value === false,
  JSON.stringify(cbRefused.value))

const cbNoOrigin = callWithCallback(undefined)
check('callback IS invoked with no Origin header', cbNoOrigin.called === true)

console.log('\n=== 7. End-to-end: ACAO header is actually emitted ===')
// Start the real app and inspect the wire response, because the unit test above
// only proves the resolver's return value, not that cors() honours it.
const { createApp } = await import('../server/src/app.js')
const app = createApp()

// A throwaway route with no database dependency, so the CORS assertions hold
// whether or not MongoDB happens to be running. The real /auth/login endpoint is
// exercised separately in section 8.
const express = (await import('express')).default
const probe = express()
probe.post('/api/__cors-probe', (_req, res) => res.json({ ok: true }))
app.use(probe)

const { default: http } = await import('node:http')
const server = http.createServer(app)
// A hard timeout so a hang fails loudly instead of stalling the suite.
server.setTimeout(5000)
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const headerFor = (origin, { preflight = false } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/__cors-probe',
        method: preflight ? 'OPTIONS' : 'POST',
        headers: preflight
          ? {
              Origin: origin,
              'Access-Control-Request-Method': 'POST',
              'Access-Control-Request-Headers': 'content-type',
            }
          : { Origin: origin },
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.headers))
      },
    )
    req.setTimeout(6000, () => req.destroy(new Error('probe timed out')))
    req.on('error', reject)
    req.end()
  })

// The configured web origin comes from CLIENT_URL, which differs between local
// .env and production. Read it rather than hardcoding, so the assertions stay
// true in both environments.
const configuredWebOrigin = String(envConfig.clientUrl || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)[0]

console.log(`  (CLIENT_URL[0] in this environment: ${configuredWebOrigin || '<unset>'})`)

for (const origin of ['https://localhost', 'capacitor://localhost', configuredWebOrigin].filter(Boolean)) {
  const headers = await headerFor(origin)
  check(`POST emits ACAO for ${origin}`, headers['access-control-allow-origin'] === origin,
    `got ${JSON.stringify(headers['access-control-allow-origin'])}`)
}

const preflight = await headerFor('https://localhost', { preflight: true })
check('OPTIONS preflight emits ACAO for https://localhost',
  preflight['access-control-allow-origin'] === 'https://localhost',
  `got ${JSON.stringify(preflight['access-control-allow-origin'])}`)
check('preflight allows credentials', preflight['access-control-allow-credentials'] === 'true')
check('preflight allows POST', String(preflight['access-control-allow-methods'] || '').includes('POST'))

const refused = await headerFor('https://evil.example')
check('unknown origin gets NO ACAO header (browser blocks it)',
  refused['access-control-allow-origin'] === undefined,
  `got ${JSON.stringify(refused['access-control-allow-origin'])}`)

console.log('\n=== 8. The REAL /auth/login endpoint ===')
// A working health check does NOT prove login works: /health is a GET with no
// database access, while login is a real authenticated POST that looks a user up.
// This exercises the endpoint the Android app actually calls and asserts the
// status is a genuine auth answer rather than a hang or a 500.
//
// createApp() does not open the database (src/index.js does that), so the
// connection is established here. Without it the lookup buffers and times out,
// which would look like a CORS failure and prove nothing.
const { connectDatabase, disconnectDatabase } = await import('../server/src/config/db.js')
let dbReady = true
try {
  await connectDatabase()
} catch {
  dbReady = false
  console.log('  (MongoDB unavailable - skipping the authenticated login assertions)')
}

if (dbReady) {
  try {
    const loginRequest = (origin) =>
      new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'nobody@example.invalid', password: 'not-a-real-password' })
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let payload = ''
        res.on('data', (c) => { payload += c })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: payload }))
      },
    )
    req.setTimeout(8000, () => req.destroy(new Error('login probe timed out')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })

    const appLogin = await loginRequest('https://localhost')
  check('POST /auth/login responds (does not hang)', appLogin.status > 0, `status=${appLogin.status}`)
  check('POST /auth/login rejects bad credentials with 401', appLogin.status === 401, `status=${appLogin.status}`)
  check('POST /auth/login emits ACAO for https://localhost',
    appLogin.headers['access-control-allow-origin'] === 'https://localhost',
    `got ${JSON.stringify(appLogin.headers['access-control-allow-origin'])}`)
  check('POST /auth/login allows credentials',
    appLogin.headers['access-control-allow-credentials'] === 'true')

  const parsed = JSON.parse(appLogin.body)
  check('rejection body is a normal auth error, not a crash', parsed.success === false && Boolean(parsed.message),
    `success=${parsed.success} message=${String(parsed.message).slice(0, 40)}`)

  const webLogin = await loginRequest(configuredWebOrigin)
  check('POST /auth/login still emits ACAO for the configured web origin',
    webLogin.headers['access-control-allow-origin'] === configuredWebOrigin,
    `got ${JSON.stringify(webLogin.headers['access-control-allow-origin'])}`)

  const evilLogin = await loginRequest('https://evil.example')
  check('POST /auth/login gives NO ACAO to an unknown origin',
    evilLogin.headers['access-control-allow-origin'] === undefined,
    `got ${JSON.stringify(evilLogin.headers['access-control-allow-origin'])}`)
  } catch (error) {
    // A database or harness failure must not be mistaken for a CORS regression.
    check(`real login endpoint probe (${error.message})`, false)
  }

  await disconnectDatabase()
}

await new Promise((resolve) => server.close(resolve))

console.log('\n' + '='.repeat(70))
console.log(`${passed} passed, ${failed} failed`)
console.log(failed === 0 ? 'RESULT: CORS VERIFIED' : 'RESULT: FAILURES')
console.log('='.repeat(70))
process.exit(failed === 0 ? 0 : 1)