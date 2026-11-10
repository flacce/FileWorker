import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../bindings'

export function badRequest(message: string): never {
  throw new HTTPException(400, { message })
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/** 读取 JSON 请求体，解析失败统一返回 400 */
export async function readJsonBody<T extends object>(c: Context<AppEnv>): Promise<Partial<T>> {
  try {
    const body = await c.req.json<unknown>()
    if (body && typeof body === 'object') return body as Partial<T>
  } catch {
    // 交由下方统一处理
  }
  badRequest('请求体必须为 JSON 对象')
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
