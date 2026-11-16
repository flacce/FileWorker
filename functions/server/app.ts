import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './bindings'
import catalog from './routes/catalog'
import delivery from './routes/delivery'
import maintenance from './routes/maintenance'
import objects from './routes/objects'
import session from './routes/session'

const STATIC_ENTRIES = ['/', '/index.html', '/favicon.ico', '/assets/*']

const app = new Hono<AppEnv>()

app.use(
  '*',
  cors({
    origin: '*',
    exposeHeaders: [
      'Content-Length',
      'Content-Range',
      'Content-Disposition',
      'ETag',
      'x-store-visibility',
      'x-store-type'
    ]
  })
)

// 前端入口与构建产物由 Workers 静态资源层直接提供，此处仅作本地兜底
app.on(['GET', 'HEAD'], STATIC_ENTRIES, (c) =>
  c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()
)

app.route('/api', session)
app.route('/api', catalog)
app.route('/api', maintenance)
app.route('/api', delivery)
app.route('/', objects)

app.notFound((c) => c.text('未找到资源', 404))

app.onError((c) => {
  const err = c.error ?? new Error('未知错误')
  if (err instanceof HTTPException) return err.getResponse()
  console.error('[fileworker]', err)
  return c.text(`服务器异常：${err.message || '未知错误'}`, 500)
})

export default app
