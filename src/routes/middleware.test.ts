import { test, expect, beforeEach } from 'bun:test'
import express from 'express'
import type { Request, Response } from 'express'
import { Onramp, Authenticate } from './middleware'
import { users, sessions } from '../store'

function createMockReqRes(body: any = {}, headers: Record<string, string> = {}) {
  const req = {
    body,
    headers,
    userId: undefined as number | undefined,
  } as unknown as Request

  let statusCode = 200
  let jsonBody: any = null

  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(data: any) {
      jsonBody = data
      return this
    },
    get statusCode() {
      return statusCode
    },
    get jsonBody() {
      return jsonBody
    },
  } as unknown as Response & { statusCode: number; jsonBody: any }

  return { req, res }
}

beforeEach(() => {
  // Clear users between tests
  users.length = 0
  for (const key of Object.keys(sessions)) {
    delete sessions[key]
  }
})

test('Onramp - success: adds collateral to user', () => {
  // Setup: create a user in the store
  const user = {
    userId: 1,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)

  const { req, res } = createMockReqRes({ amount: 100 })
  req.userId = 1

  Onramp(req, res)

  expect(res.jsonBody).toEqual({
    collateral: { available: 100, locked: 0 },
  })
})

test('Onramp - success: accumulates collateral over multiple calls', () => {
  const user = {
    userId: 1,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)

  const { req: req1, res: res1 } = createMockReqRes({ amount: 50 })
  req1.userId = 1
  Onramp(req1, res1)

  expect(res1.jsonBody).toEqual({
    collateral: { available: 50, locked: 0 },
  })

  const { req: req2, res: res2 } = createMockReqRes({ amount: 75 })
  req2.userId = 1
  Onramp(req2, res2)

  expect(res2.jsonBody).toEqual({
    collateral: { available: 125, locked: 0 },
  })
})

test('Onramp - error: missing amount', () => {
  const user = {
    userId: 1,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)

  const { req, res } = createMockReqRes({})
  req.userId = 1

  Onramp(req, res)

  expect(res.jsonBody).toEqual({ error: 'Amount must be a positive number' })
})

test('Onramp - error: negative amount', () => {
  const user = {
    userId: 1,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)

  const { req, res } = createMockReqRes({ amount: -10 })
  req.userId = 1

  Onramp(req, res)

  expect(res.jsonBody).toEqual({ error: 'Amount must be a positive number' })
})

test('Onramp - error: zero amount', () => {
  const user = {
    userId: 1,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)

  const { req, res } = createMockReqRes({ amount: 0 })
  req.userId = 1

  Onramp(req, res)

  expect(res.jsonBody).toEqual({ error: 'Amount must be a positive number' })
})

test('Onramp - error: user not found', () => {
  const { req, res } = createMockReqRes({ amount: 100 })
  req.userId = 999 // non-existent user

  Onramp(req, res)

  expect(res.jsonBody).toEqual({ error: 'User not found' })
})

test('Onramp - does not affect other users collateral', () => {
  const user1 = {
    userId: 1,
    username: 'user1',
    password: 'pass1',
    collateral: { available: 50, locked: 0 },
    positions: [],
    orders: [],
  }
  const user2 = {
    userId: 2,
    username: 'user2',
    password: 'pass2',
    collateral: { available: 20, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user1, user2)

  const { req, res } = createMockReqRes({ amount: 100 })
  req.userId = 1

  Onramp(req, res)

  expect(users[0].collateral.available).toBe(150)
  expect(users[1].collateral.available).toBe(20)
})

test('Onramp - integration: full flow via Express route', async () => {
  const app = express()
  app.use(express.json())

  // Inline the route to test the full middleware chain
  app.post('/onramp', Authenticate, Onramp)

  // Register a user directly in the store
  const user = {
    userId: 1,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)

  // Create a session token for the user
  const token = 'test-token-123'
  sessions[token] = 1

  // Start the server
  const server = app.listen(0)
  const port = (server.address() as any).port

  try {
    // Test successful onramp
    const res = await fetch(`http://localhost:${port}/onramp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount: 200 }),
    })

    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ collateral: { available: 200, locked: 0 } })
  } finally {
    server.close()
  }
})
