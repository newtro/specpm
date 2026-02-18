import { mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Result } from 'shared'

const AUTH_DIR = join(homedir(), '.specpm')
const AUTH_FILE = join(AUTH_DIR, 'auth.json')

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

export interface LoginOptions {
  registry: string
  token?: string
  username?: string
  password?: string
}

export async function loginCommand(options: LoginOptions): Promise<Result<string, string>> {
  const { registry } = options

  let token: string

  if (options.token) {
    // Direct token mode
    token = options.token
  } else if (options.username && options.password) {
    // Username/password login
    const res = await fetch(`${registry}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: options.username, password: options.password }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any
      return { ok: false, error: `Login failed: ${body.error ?? res.statusText}` }
    }

    const body = await res.json() as any
    token = body.token
    console.error(`Logged in as ${body.username}`)
  } else {
    return { ok: false, error: 'Provide --token or --username and --password' }
  }

  // Verify token works
  const whoamiRes = await fetch(`${registry}/api/v1/auth/whoami`, {
    headers: { authorization: `Bearer ${token}` },
  })

  if (!whoamiRes.ok) {
    return { ok: false, error: 'Token verification failed' }
  }

  const whoami = await whoamiRes.json() as any

  // Store auth
  await mkdir(AUTH_DIR, { recursive: true })
  await writeFile(AUTH_FILE, JSON.stringify({ registry, token }, null, 2))
  console.error(`✅ Authenticated as ${whoami.username} on ${registry}`)
  return { ok: true, value: whoami.username }
}

export async function logoutCommand(): Promise<Result<string, string>> {
  if (await fileExists(AUTH_FILE)) {
    await rm(AUTH_FILE)
    console.error('✅ Logged out')
    return { ok: true, value: 'Logged out' }
  }
  console.error('Not logged in')
  return { ok: true, value: 'Not logged in' }
}
