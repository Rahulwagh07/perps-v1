import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import express from 'express'
import authRoutes from './auth'
import http from 'node:http'

const PORT = 3456
const BASE_URL = `http://localhost:${PORT}`

let httpServer: http.Server

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(authRoutes)
  return app
}

beforeAll(() => {
  const app = createApp()
  httpServer = http.createServer(app)
  return new Promise<void>((resolve) => {
    httpServer.listen(PORT, () => resolve())
  })
})

afterAll(() => {
  return new Promise<void>((resolve) => {
    httpServer.close(() => resolve())
  })
})

async function signUp(username: string, password: string) {
  const res = await fetch(`${BASE_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res.json()
}

async function signIn(username: string, password: string) {
  const res = await fetch(`${BASE_URL}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res.json()
}

async function onramp(token: string, amount: number) {
  const res = await fetch(`${BASE_URL}/onramp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  })
  return { status: res.status, body: await res.json() }
}

describe('POST /onramp', () => {
  test('should add collateral to user account', async () => {
    const username = `user_onramp_1_${Date.now()}`
    await signUp(username, 'password123')
    const { token } = await signIn(username, 'password123')

    const { status, body } = await onramp(token, 1000)

    expect(status).toBe(200)
    expect(body.collateral.available).toBe(1000)
    expect(body.collateral.locked).toBe(0)
  })

  test('should accumulate collateral on multiple onramps', async () => {
    const username = `user_onramp_2_${Date.now()}`
    await signUp(username, 'password123')
    const { token } = await signIn(username, 'password123')

    await onramp(token, 500)
    const { status, body } = await onramp(token, 300)

    expect(status).toBe(200)
    expect(body.collateral.available).toBe(800)
    expect(body.collateral.locked).toBe(0)
  })

  test('should return 400 when amount is missing', async () => {
    const username = `user_onramp_3_${Date.now()}`
    await signUp(username, 'password123')
    const { token } = await signIn(username, 'password123')

    const res = await fetch(`${BASE_URL}/onramp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Amount must be a positive number')
  })

  test('should return 400 when amount is negative', async () => {
    const username = `user_onramp_4_${Date.now()}`
    await signUp(username, 'password123')
    const { token } = await signIn(username, 'password123')

    const { status, body } = await onramp(token, -100)

    expect(status).toBe(400)
    expect(body.error).toBe('Amount must be a positive number')
  })

  test('should return 401 when no auth token is provided', async () => {
    const res = await fetch(`${BASE_URL}/onramp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100 }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  test('should return 401 when invalid token is provided', async () => {
    const { status, body } = await onramp('invalid-token-abc', 100)

    expect(status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })
})
