import { test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import {
  startServer,
  stopServer,
  freshStore,
  createTestUser,
  signUp,
  signIn,
  onramp,
} from '../test/helpers'

let baseUrl: string

beforeAll(async () => {
  baseUrl = await startServer()
})

afterAll(async () => {
  await stopServer()
})

beforeEach(() => {
  freshStore()
})

// ─── POST /signup ────────────────────────────────────────────

test('signup - success', async () => {
  const res = await signUp(baseUrl, 'alice', 'pass123')
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual({ userId: 1, username: 'alice' })
})

test('signup - missing username', async () => {
  const res = await fetch(`${baseUrl}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'pass123' }),
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('username and password are required')
})

test('signup - missing password', async () => {
  const res = await fetch(`${baseUrl}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice' }),
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('username and password are required')
})

test('signup - duplicate username', async () => {
  await signUp(baseUrl, 'alice', 'pass123')
  const res = await signUp(baseUrl, 'alice', 'pass456')
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toBe('username is already taken')
})

// ─── POST /signin ────────────────────────────────────────────

test('signin - success', async () => {
  await signUp(baseUrl, 'alice', 'pass123')
  const res = await signIn(baseUrl, 'alice', 'pass123')
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.token).toBeString()
})

test('signin - wrong password', async () => {
  await signUp(baseUrl, 'alice', 'pass123')
  const res = await signIn(baseUrl, 'alice', 'wrongpass')
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('invalid credentials')
})

test('signin - nonexistent user', async () => {
  const res = await signIn(baseUrl, 'nobody', 'pass123')
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('invalid credentials')
})

// ─── POST /onramp-usdc ───────────────────────────────────────

test('onramp-usdc - success', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  const res = await onramp(baseUrl, token, 100)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.collateral.available).toBe(100)
  expect(body.collateral.locked).toBe(0)
})

test('onramp-usdc - cumulative deposits', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onramp(baseUrl, token, 50)
  const res = await onramp(baseUrl, token, 30)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.collateral.available).toBe(80)
})

test('onramp-usdc - missing amount', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  const res = await fetch(`${baseUrl}/onramp-usdc`, {
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

test('onramp-usdc - negative amount', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  const res = await fetch(`${baseUrl}/onramp-usdc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount: -50 }),
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('Amount must be a positive number')
})

test('onramp-usdc - unauthorized', async () => {
  const res = await fetch(`${baseUrl}/onramp-usdc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  })
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('Unauthorized')
})
