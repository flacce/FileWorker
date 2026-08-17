import { request } from './client'

/**
 * POST /api/auth with password.
 */
export async function login(password: string): Promise<boolean> {
  try {
    const res = await request<{ ok: boolean }>('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return res.ok === true
  } catch {
    return false
  }
}

/**
 * GET /api/auth to verify current session cookie.
 */
export async function verifyAuth(): Promise<boolean> {
  try {
    await request<{ ok: boolean }>('/api/auth', {
      method: 'GET',
    })
    return true
  } catch {
    return false
  }
}
