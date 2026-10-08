/**
 * Shared headless-Firefox helper.
 *
 * A single place for the BiDi plumbing so verification scripts stay short and do
 * not each re-derive the awkward parts:
 *   - BiDi needs a real browsing-context id, not the string "default"
 *   - results come back as RemoteValue objects and must be deserialised
 *   - Firefox announces its WebSocket URL on stderr, not stdout
 *
 * Exposes `withBrowser(fn)` so a test reads as a flat list of assertions.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Deserialises a BiDi RemoteValue into a plain JS value. */
function deserialize(v) {
  if (!v) return v
  if (['string', 'number', 'boolean'].includes(v.type)) return v.value
  if (v.type === 'object') {
    return Object.fromEntries(
      (Array.isArray(v.value) ? v.value : []).map((p) => [p[0], deserialize(p[1])]),
    )
  }
  if (v.type === 'array') return (v.value || []).map(deserialize)
  return v.value
}

export async function withBrowser({ port, url, onConsole }, fn) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-v-'))

  const ff = spawn('/usr/bin/firefox', [
    '--headless',
    '--profile', profileDir,
    '--no-remote',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port', String(port),
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  let buf = ''
  const wsUrl = await new Promise((resolve) => {
    ff.stderr.on('data', (c) => {
      buf += c.toString()
      const m = buf.match(/WebDriver BiDi listening on (ws:\/\/\S+)/)
      if (m) resolve(m[1].replace(/\/+$/, '') + '/session')
    })
    setTimeout(() => resolve(`ws://127.0.0.1:${port}/session`), 30000)
  })

  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))

  let id = 0
  const pending = new Map()
  const consoleEntries = []

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.type === 'error' ? reject(new Error(m.message || m.error)) : resolve(m.result)
    } else if (m.method === 'log.entryAdded') {
      consoleEntries.push(m.params)
      onConsole?.(m.params)
    }
  })

  const send = (method, params = {}, timeout = 25000) =>
    new Promise((resolve, reject) => {
      id += 1
      const callId = id
      pending.set(callId, { resolve, reject })
      ws.send(JSON.stringify({ id: callId, method, params }))
      setTimeout(() => {
        if (pending.has(callId)) {
          pending.delete(callId)
          reject(new Error(`timeout ${method}`))
        }
      }, timeout)
    })

  await send('session.new', { capabilities: {} })
  await send('session.subscribe', { events: ['log.entryAdded'] })
  const { contexts } = await send('browsingContext.getTree', {})
  const context = contexts[0].context

  const api = {
    context,
    consoleEntries,

    /** Evaluates an expression in the page and deserialises the result. */
    async ev(expression, timeout = 25000) {
      const r = await send(
        'script.evaluate',
        { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' },
        timeout,
      )
      return deserialize(r?.result)
    },

    /** Navigates and waits for the load event. */
    async goto(target, settle = 2500) {
      await send('browsingContext.navigate', { context, url: target, wait: 'complete' })
      await sleep(settle)
    },

    async setViewport(width, height) {
      await send('browsingContext.setViewport', {
        context,
        viewport: { width, height },
        devicePixelRatio: 2,
      })
    },

    /** Stores an auth token directly, avoiding a slow form interaction. */
    async login(apiBase, email, password) {
      await api.ev(`(async () => {
        const r = await fetch('${apiBase}/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }),
        });
        const d = await r.json();
        if (!d.data || !d.data.token) throw new Error('login failed');
        localStorage.setItem('musica.token', d.data.token);
        localStorage.setItem('musica.user', JSON.stringify(d.data.user));
        return true;
      })()`)
    },

    close() {
      try { ws.close() } catch { /* already closed */ }
      try { ff.kill('SIGKILL') } catch { /* already gone */ }
      fs.rmSync(profileDir, { recursive: true, force: true })
    },
  }

  try {
    return await fn(api)
  } finally {
    api.close()
  }
}

export { sleep }
export default withBrowser