import type { Server } from 'node:http'
import app from '../app'
import { resetStore } from '../store'

let server: Server | null = null

export async function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address()
      const port = typeof addr === 'object' && addr ? addr.port : 3000
      resolve(`http://localhost:${port}`)
    })
  })
}

export async function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null
        resolve()
      })
    } else {
      resolve()
    }
  })
}

export function freshStore() {
  resetStore()
}

export async function signUp(
  baseUrl: string,
  username: string,
  password: string
) {
  const res = await fetch(`${baseUrl}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res
}

export async function signIn(
  baseUrl: string,
  username: string,
  password: string
) {
  const res = await fetch(`${baseUrl}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res
}

export async function onramp(
  baseUrl: string,
  token: string,
  amount: number
) {
  const res = await fetch(`${baseUrl}/onramp-usdc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  })
  return res
}

export async function createTestUser(
  baseUrl: string,
  username = 'testuser',
  password = 'testpass'
) {
  await signUp(baseUrl, username, password)
  const signInRes = await signIn(baseUrl, username, password)
  const { token } = (await signInRes.json()) as { token: string }
  return token
}

export async function authGet(baseUrl: string, path: string, token: string) {
  return fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}
