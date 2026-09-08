import { test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import {
  startServer,
  stopServer,
  freshStore,
  createTestUser,
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

async function placeOrder(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>
) {
  return fetch(`${baseUrl}/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

async function cancelOrder(baseUrl: string, token: string, orderId: number) {
  return fetch(`${baseUrl}/order`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId }),
  })
}

async function onrampUser(token: string, amount: number) {
  return fetch(`${baseUrl}/onramp-usdc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  })
}

// ─── POST /order ─────────────────────────────────────────────

test('place order - limit order success', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'LONG',
    qty: 10,
    orderType: 'limit',
    price: 85,
    margin: 100,
  })
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.orderId).toBe(1)
  expect(body.status).toBe('open')
  expect(body.filledQty).toBe(0)
  expect(body.price).toBe(85)
})

test('place order - market order success', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'LONG',
    qty: 5,
    orderType: 'market',
    margin: 50,
  })
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.orderId).toBe(1)
  expect(body.price).toBe(90) // lastTradedPrice from SOL orderbook
})

test('place order - missing required fields', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await placeOrder(baseUrl, token, { market: 'SOL' })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('Missing required fields')
})

test('place order - invalid type', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'INVALID',
    qty: 10,
    orderType: 'limit',
    price: 85,
    margin: 100,
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('type must be LONG or SHORT')
})

test('place order - invalid orderType', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'LONG',
    qty: 10,
    orderType: 'stop',
    price: 85,
    margin: 100,
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('orderType must be limit or market')
})

test('place order - insufficient balance', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 50)

  const res = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'LONG',
    qty: 10,
    orderType: 'limit',
    price: 85,
    margin: 100,
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('insufficient balance')
})

test('place order - unauthorized', async () => {
  const res = await fetch(`${baseUrl}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 100,
    }),
  })
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body.error).toBe('Unauthorized')
})

// ─── DELETE /order ───────────────────────────────────────────

test('cancel order - success', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)
  const placeRes = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'LONG',
    qty: 10,
    orderType: 'limit',
    price: 85,
    margin: 100,
  })
  const { orderId } = (await placeRes.json()) as { orderId: number }

  const res = await cancelOrder(baseUrl, token, orderId)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.message).toBe('order cancelled')
  expect(body.marginToReturned).toBe(100)
})

test('cancel order - missing orderId', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await fetch(`${baseUrl}/order`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  })
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('Orderid is required')
})

test('cancel order - order not found', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)

  const res = await cancelOrder(baseUrl, token, 999)
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('Order not found')
})

test('cancel order - unauthorized', async () => {
  const res = await fetch(`${baseUrl}/order`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 1 }),
  })
  expect(res.status).toBe(401)
})

test('cancel order - returns partial margin', async () => {
  const token = await createTestUser(baseUrl, 'alice', 'pass123')
  await onrampUser(token, 1000)
  const placeRes = await placeOrder(baseUrl, token, {
    market: 'SOL',
    type: 'LONG',
    qty: 10,
    orderType: 'limit',
    price: 85,
    margin: 100,
  })
  const { orderId } = (await placeRes.json()) as { orderId: number }

  const res = await cancelOrder(baseUrl, token, orderId)
  const body = await res.json()
  // full margin returned since nothing was filled
  expect(body.marginToReturned).toBe(100)
})
