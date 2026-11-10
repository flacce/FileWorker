import { Hono, type Context } from 'hono'
import type { AppEnv } from '../bindings'
import { isAuthorized, verifyPassword } from '../security/guard'
import { resolveSecret } from '../security/secret'
import { issueSessionCookies, mintSessionToken } from '../security/session'

/** 兼容 JSON、表单与纯文本三种口令提交方式 */
async function extractPassword(c: Context<AppEnv>): Promise<string> {
  const type = c.req.header('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const body = await c.req.json<{ password?: unknown }>()
      return typeof body?.password === 'string' ? body.password : ''
    }
    if (type.includes('form')) {
      const value = (await c.req.parseBody())['password']
      return typeof value === 'string' ? value : ''
    }
    return (await c.req.text()).trim()
  } catch {
    return ''
  }
}

const session = new Hono<AppEnv>()

session.get('/auth', async (c) => {
  if (!(await isAuthorized(c))) return c.text('未授权访问', 401)
  return c.json({ ok: true })
})

session.post('/auth', async (c) => {
  const secret = await resolveSecret(c.env)
  if (!secret) {
    issueSessionCookies(c, null)
    return c.json({ ok: true })
  }

  const password = await extractPassword(c)
  if (!password) return c.text('请输入密码', 400)
  if (!(await verifyPassword(password, secret, c.env.PASSWORD))) {
    return c.text('密码错误', 401)
  }

  issueSessionCookies(c, await mintSessionToken(secret))
  return c.json({ ok: true })
})

export default session
