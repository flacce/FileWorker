import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

const browserCookies = new Map()
const localValues = new Map()
const history = {
  state: null,
  length: 1,
  pushState(state) {
    this.state = state
  },
  replaceState(state) {
    this.state = state
  },
  go() {}
}
const location = { host: 'localhost', pathname: '/', search: '', hash: '#/file', protocol: 'http:' }

globalThis.document = {
  createElement: () => ({ content: {} }),
  querySelector: () => null,
  get cookie() {
    return [...browserCookies].map(([name, value]) => `${name}=${value}`).join('; ')
  },
  set cookie(value) {
    const [pair, ...attributes] = value.split(';')
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    if (attributes.some((attribute) => attribute.trim().toLowerCase() === 'max-age=0')) {
      browserCookies.delete(name)
    } else {
      browserCookies.set(name, pair.slice(separator + 1))
    }
  }
}

globalThis.window = {
  location,
  history,
  addEventListener() {},
  removeEventListener() {},
  scrollTo() {},
  setTimeout
}
globalThis.location = location
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) ?? null,
  setItem: (key, value) => localValues.set(key, value),
  removeItem: (key) => localValues.delete(key)
}

let vite
let app
let endSession
let hasExplicitLogout
let clearExplicitLogout

before(async () => {
  vite = await createServer({
    configFile: './vite.config.ts',
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom'
  })
  ;({ default: app } = await vite.ssrLoadModule('/functions/server/app.ts'))
  ;({ endSession, hasExplicitLogout, clearExplicitLogout } =
    await vite.ssrLoadModule('/src/api/gateway.ts'))
})

after(async () => {
  await vite?.close()
})

test('authenticated logout expires all session cookies and rejects the old session', async () => {
  const env = { PASSWORD: 'test-password' }
  const login = await app.fetch(
    new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: env.PASSWORD })
    }),
    env
  )
  assert.equal(login.status, 200)

  const sessionCookie = login.headers
    .getSetCookie()
    .filter((cookie) => !cookie.includes('Max-Age=0'))
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
  const authenticated = await app.fetch(
    new Request('http://localhost/api/auth', { headers: { cookie: sessionCookie } }),
    env
  )
  assert.equal(authenticated.status, 200)

  const logout = await app.fetch(
    new Request('http://localhost/api/logout', {
      method: 'POST',
      headers: { cookie: sessionCookie }
    }),
    env
  )
  assert.equal(logout.status, 200)
  const expired = logout.headers.getSetCookie()
  assert.deepEqual(expired.map((cookie) => cookie.split('=')[0]).sort(), [
    'PASSWORD',
    '__auth',
    '__session'
  ])
  assert.ok(expired.every((cookie) => cookie.includes('Max-Age=0')))

  const expiredNames = new Set(expired.map((cookie) => cookie.split('=')[0]))
  const remainingCookie = sessionCookie
    .split('; ')
    .filter((cookie) => !expiredNames.has(cookie.split('=')[0]))
    .join('; ')
  const unauthenticated = await app.fetch(
    new Request('http://localhost/api/auth', { headers: { cookie: remainingCookie } }),
    env
  )
  assert.equal(unauthenticated.status, 401)
})

test('logout is idempotent without a session', async () => {
  const env = { PASSWORD: 'test-password' }
  const logout = await app.fetch(
    new Request('http://localhost/api/logout', { method: 'POST' }),
    env
  )
  assert.equal(logout.status, 200)
  assert.equal(logout.headers.getSetCookie().length, 3)
})

test('client logout coalesces requests and keeps local logout when the API fails', async () => {
  browserCookies.set('__auth', '1')
  browserCookies.set('PASSWORD', 'old')
  clearExplicitLogout()

  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    throw new Error('offline')
  }

  try {
    const first = endSession()
    const duplicate = endSession()
    assert.strictEqual(first, duplicate)
    assert.equal(await first, false)
    assert.equal(requests, 1)
    assert.equal(document.cookie, '')
    assert.equal(hasExplicitLogout(), true)
  } finally {
    globalThis.fetch = originalFetch
    clearExplicitLogout()
  }
})

test('client logout succeeds with one POST and can be cleared after a new login', async () => {
  browserCookies.set('__auth', '1')
  clearExplicitLogout()

  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, method: init.method })
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  try {
    assert.equal(await endSession(), true)
    assert.deepEqual(requests, [{ url: '/api/logout', method: 'POST' }])
    assert.equal(hasExplicitLogout(), true)
    clearExplicitLogout()
    assert.equal(hasExplicitLogout(), false)
  } finally {
    globalThis.fetch = originalFetch
    clearExplicitLogout()
  }
})
