import { test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import {
  startServer,
  stopServer,
  freshStore,
  createTestUser,
  authGet,
} from '../test/helpers'
import { users } from '../store'

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

// ─── GET /equity/available ───────────────────────────────────

test('equity/available - returns zero for new user', async () => {
  const token = await createTestUser(baseUrl)
  const res = await authGet(baseUrl, '/equity/available', token)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.totalEquity).toBe(0)
})

test('equity/available - reflects collateral', async () => {
  const token = await createTestUser(baseUrl)
  await fetch(`${baseUrl}/onramp-usdc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount: 500 }),
  })
  const res = await authGet(baseUrl, '/equity/available', token)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.totalEquity).toBe(500)
})

test('equity/available - unauthorized', async () => {
  const res = await authGet(baseUrl, '/equity/available', 'invalid-token')
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('Unauthorized')
})

// ─── GET /positions/open/:marketId ───────────────────────────

test('positions/open - returns empty when no positions', async () => {
  const token = await createTestUser(baseUrl)
  const res = await authGet(baseUrl, '/positions/open/SOL', token)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.positions).toEqual([])
})

test('positions/open - unauthorized', async () => {
  const res = await authGet(baseUrl, '/positions/open/SOL', 'invalid-token')
  expect(res.status).toBe(401)
})

// ─── GET /positions/closed/:marketId ─────────────────────────

test('positions/closed - returns empty when no positions', async () => {
  const token = await createTestUser(baseUrl)
  const res = await authGet(baseUrl, '/positions/closed/SOL', token)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.positions).toEqual([])
})

test('positions/closed - unauthorized', async () => {
  const res = await authGet(baseUrl, '/positions/closed/SOL', 'invalid-token')
  expect(res.status).toBe(401)
})

// ─── GET /orders/open/:marketId ──────────────────────────────

test('orders/open - returns empty when no orders', async () => {
  const token = await createTestUser(baseUrl)
  const res = await authGet(baseUrl, '/orders/open/SOL', token)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.openOrders).toEqual([])
})

test('orders/open - unauthorized', async () => {
  const res = await authGet(baseUrl, '/orders/open/SOL', 'invalid-token')
  expect(res.status).toBe(401)
})

// ─── GET /orders/:marketId ───────────────────────────────────

test('orders - returns empty when no orders', async () => {
  const token = await createTestUser(baseUrl)
  const res = await authGet(baseUrl, '/orders/SOL', token)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.orders).toEqual([])
})

test('orders - unauthorized', async () => {
  const res = await authGet(baseUrl, '/orders/SOL', 'invalid-token')
  expect(res.status).toBe(401)
})

// ─── GET /fills ──────────────────────────────────────────────

test('fills - returns empty when no fills', async () => {
  const res = await fetch(`${baseUrl}/fills`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual([])
})

test('fills - with market query param', async () => {
  const res = await fetch(`${baseUrl}/fills?market=SOL`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual([])
})
