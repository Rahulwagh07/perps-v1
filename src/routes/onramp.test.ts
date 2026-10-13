import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import authRoutes from './auth'
import { users } from '../store'
import { Onramp } from './middleware'

let server: Server
let baseUrl: string

beforeAll(() => {
  const app = express()
  app.use(express.json())
  app.use(authRoutes)

  server = app.listen(0)
  const { port } = server.address() as AddressInfo
  baseUrl = `http://localhost:${port}`
})

afterAll(() => {
  server.close()
})

let userCounter = 0

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  return { status: res.status, body: (await res.json()) as any }
}

async function createUserAndSignIn(password = 'password123') {
  const username = `onramp-user-${++userCounter}-${Date.now()}`
  const signup = await request('/signup', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  expect(signup.status).toBe(200)

  const signin = await request('/signin', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  expect(signin.status).toBe(200)

  return { userId: signup.body.userId as number, token: signin.body.token as string }
}

function onramp(token: string | undefined, amount?: unknown) {
  return request('/onramp', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(amount === undefined ? {} : { amount }),
  })
}

describe('POST /onramp', () => {
  test('returns 401 when no authorization header is provided', async () => {
    const res = await onramp(undefined, 100)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  test('returns 401 when the token is invalid', async () => {
    const res = await onramp('definitely-not-a-valid-token', 100)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  test('returns 400 when amount is missing', async () => {
    const { token } = await createUserAndSignIn()
    const res = await onramp(token)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Amount must be a positive number' })
  })

  test('returns 400 when amount is zero', async () => {
    const { token } = await createUserAndSignIn()
    const res = await onramp(token, 0)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Amount must be a positive number' })
  })

  test('returns 400 when amount is negative', async () => {
    const { token } = await createUserAndSignIn()
    const res = await onramp(token, -100)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Amount must be a positive number' })
  })

  test('returns 401 when the user no longer exists', async () => {
    // Authenticate resolves the user from the session before Onramp runs,
    // so a deleted user is rejected as unauthorized.
    const { userId, token } = await createUserAndSignIn()
    const index = users.findIndex(u => u.userId === userId)
    expect(index).toBeGreaterThanOrEqual(0)
    users.splice(index, 1)

    const res = await onramp(token, 100)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  test('adds the amount to available collateral', async () => {
    const { userId, token } = await createUserAndSignIn()
    const res = await onramp(token, 250.5)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ collateral: { available: 250.5, locked: 0 } })

    const user = users.find(u => u.userId === userId)
    expect(user?.collateral).toEqual({ available: 250.5, locked: 0 })
  })

  test('accumulates collateral across multiple onramps', async () => {
    const { userId, token } = await createUserAndSignIn()

    const first = await onramp(token, 100)
    expect(first.status).toBe(200)
    expect(first.body.collateral.available).toBe(100)

    const second = await onramp(token, 50)
    expect(second.status).toBe(200)
    expect(second.body.collateral.available).toBe(150)

    const user = users.find(u => u.userId === userId)
    expect(user?.collateral.available).toBe(150)
  })
})

// The "User not found" branch of the handler is unreachable through the route
// (Authenticate rejects unknown users first), so cover it directly.
describe('Onramp handler', () => {
  function mockResponse() {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code
        return res
      },
      json(payload: unknown) {
        res.body = payload
        return res
      },
    }
    return res
  }

  test('returns 400 when userId does not match any user', () => {
    const res = mockResponse()
    Onramp({ userId: -1, body: { amount: 100 } } as never, res as never)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'User not found' })
  })
})
