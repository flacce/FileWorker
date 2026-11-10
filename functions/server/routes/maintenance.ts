import { Hono } from 'hono'
import type { AppEnv } from '../bindings'
import { eraseCandidates, objectRefFromInput, readCandidates } from '../core/keys'
import { asText, badRequest, readJsonBody } from '../core/request'
import { requireAuth } from '../security/guard'
import { locateObject } from '../storage/bucket'

/** R2 单次批量删除上限 */
const DELETE_CHUNK = 1000

const maintenance = new Hono<AppEnv>()

maintenance.post('/rename', requireAuth, async (c) => {
  const body = await readJsonBody<{ oldKey: string; newKey: string }>(c)
  const from = objectRefFromInput(asText(body.oldKey))
  const to = objectRefFromInput(asText(body.newKey))
  if (!from.key || !to.key) badRequest('参数无效')

  const source = await locateObject(c.env.BUCKET, readCandidates(from))
  if (!source) return c.text('未找到源文件', 404)
  if (source.key === to.key) {
    await source.body.cancel()
    return c.text('OK')
  }

  await c.env.BUCKET.put(to.key, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata
  })
  await c.env.BUCKET.delete(source.key)
  return c.text('OK')
})

maintenance.post('/batch-delete', requireAuth, async (c) => {
  const body = await readJsonBody<{ keys: unknown[] }>(c)
  const keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === 'string') : []
  if (!keys.length) badRequest('参数 keys 必须为非空数组')

  const targets = [...new Set(keys.flatMap((k) => eraseCandidates(objectRefFromInput(k))))]
  for (let i = 0; i < targets.length; i += DELETE_CHUNK) {
    await c.env.BUCKET.delete(targets.slice(i, i + DELETE_CHUNK))
  }
  return c.json({ ok: true, count: keys.length })
})

export default maintenance
