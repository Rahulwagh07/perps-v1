import { test, expect, beforeAll, afterAll, beforeEach, describe } from 'bun:test'
import app from './app'
import { resetStore, users, sessions, orderbooks, fills } from './store'

let server: ReturnType<typeof app.listen>
const BASE = 'http://localhost:3456'

beforeAll(() => {
  server = app.listen(3456)
})

afterAll(() => {
  server?.close()
})

beforeEach(() => {
  resetStore()
})

// Helper: signup and return userId
async function signup(username = 'alice', password = 'pass123') {
  const res = await fetch(`${BASE}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res.json() as Promise<{ userId: number; username: string }>
}

// Helper: signin and return token
async function signin(username = 'alice', password = 'pass123') {
  const res = await fetch(`${BASE}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res.json() as Promise<{ token: string }>
}

// Helper: onboard a user with some collateral (returns Response object)
async function onboardResp(token: string, amount = 10000) {
  return fetch(`${BASE}/onramp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  })
}

// Helper: onboard and return body
async function onboard(token: string, amount = 10000) {
  const res = await onboardResp(token, amount)
  return res.json() as Promise<any>
}

// Helper: place an order
async function placeOrder(
  token: string,
  opts: {
    market: string
    type: 'LONG' | 'SHORT'
    qty: number
    orderType: 'limit' | 'market'
    price: number
    margin: number
  }
) {
  const res = await fetch(`${BASE}/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(opts),
  })
  return res
}

// ─────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────

describe('POST /signup', () => {
  test('creates a new user successfully', async () => {
    const res = await fetch(`${BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'pass123' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe(1)
    expect(body.username).toBe('alice')
  })

  test('returns 400 when username is missing', async () => {
    const res = await fetch(`${BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'pass123' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('username and password are required')
  })

  test('returns 400 when password is missing', async () => {
    const res = await fetch(`${BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('username and password are required')
  })

  test('returns 409 when username is already taken', async () => {
    await signup('alice', 'pass123')

    const res = await fetch(`${BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'other' }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('username is already taken')
  })

  test('can create multiple users with different usernames', async () => {
    const u1 = await signup('alice', 'pass123')
    const u2 = await signup('bob', 'pass456')

    expect(u1.userId).toBe(1)
    expect(u2.userId).toBe(2)
    expect(u1.username).toBe('alice')
    expect(u2.username).toBe('bob')
  })
})

describe('POST /signin', () => {
  test('returns a token for valid credentials', async () => {
    await signup('alice', 'pass123')

    const res = await fetch(`${BASE}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'pass123' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
  })

  test('returns 401 for invalid username', async () => {
    await signup('alice', 'pass123')

    const res = await fetch(`${BASE}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wrong', password: 'pass123' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid credentials')
  })

  test('returns 401 for invalid password', async () => {
    await signup('alice', 'pass123')

    const res = await fetch(`${BASE}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid credentials')
  })

  test('returns 401 when no user exists', async () => {
    const res = await fetch(`${BASE}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ghost', password: 'pass' }),
    })

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────
// ONRAMP ENDPOINT
// ─────────────────────────────────────────────

describe('POST /onramp', () => {
  test('adds collateral to user account', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/onramp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount: 5000 }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.collateral.available).toBe(5000)
    expect(body.collateral.locked).toBe(0)
  })

  test('accumulates collateral on multiple onramps', async () => {
    await signup()
    const { token } = await signin()

    await onboard(token, 3000)

    const res = await onboardResp(token, 2000)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.collateral.available).toBe(5000)
  })

  test('returns 400 for negative amount', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/onramp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount: -100 }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Amount must be a positive number')
  })

  test('returns 400 for missing amount', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/onramp`, {
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

  test('returns 401 without auth token', async () => {
    const res = await fetch(`${BASE}/onramp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100 }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  test('returns 401 with invalid token', async () => {
    const res = await fetch(`${BASE}/onramp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalidtoken',
      },
      body: JSON.stringify({ amount: 100 }),
    })

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────
// ORDER ENDPOINTS
// ─────────────────────────────────────────────

describe('POST /order', () => {
  test('places a limit buy order successfully', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    const res = await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.orderId).toBeDefined()
    expect(body.status).toBe('open')
    expect(body.filledQty).toBe(0)
    expect(body.price).toBe(85)
  })

  test('places a limit sell order successfully', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    const res = await placeOrder(token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 400,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.orderId).toBeDefined()
    expect(body.status).toBe('open')
    expect(body.filledQty).toBe(0)
  })

  test('places a market order successfully', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    const res = await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'market',
      price: 0, // market order doesn't need price
      margin: 300,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.orderId).toBeDefined()
    expect(body.price).toBe(90) // uses lastTradedPrice
  })

  test('returns 400 for missing required fields', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token)

    const res = await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 0,
      orderType: 'limit',
      price: 85,
      margin: 0,
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Missing required fields')
  })

  test('returns 400 for invalid order type', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token)

    const res = await fetch(`${BASE}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'invalid',
        price: 85,
        margin: 500,
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('orderType must be limit or market')
  })

  test('returns 400 for invalid side', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token)

    const res = await fetch(`${BASE}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market: 'SOL',
        type: 'UP',
        qty: 10,
        orderType: 'limit',
        price: 85,
        margin: 500,
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('type must be LONG or SHORT')
  })

  test('returns 400 for insufficient balance', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 100) // only 100

    const res = await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500, // need 500 but only have 100
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('insufficient balance')
  })

  test('deducts margin from available balance', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    const user = users[0]
    expect(user.collateral.available).toBe(9500)
    expect(user.collateral.locked).toBe(500)
  })

  test('limit order requires price', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token)

    const res = await fetch(`${BASE}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: 0,
        margin: 500,
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('price is req for limit orders')
  })

  test('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: 85,
        margin: 500,
      }),
    })

    expect(res.status).toBe(401)
  })

  test('creates new market orderbook if market does not exist', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    const res = await placeOrder(token, {
      market: 'BTC',
      type: 'LONG',
      qty: 1,
      orderType: 'limit',
      price: 50000,
      margin: 1000,
    })

    expect(res.status).toBe(201)
    expect(orderbooks['BTC']).toBeDefined()
    expect(orderbooks['BTC'].lastTradedPrice).toBe(50000)
  })
})

describe('DELETE /order', () => {
  test('cancels an open order', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    const orderRes = await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    const { orderId } = await orderRes.json()

    const res = await fetch(`${BASE}/order`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('order cancelled')
    expect(body.marginToReturned).toBe(500)
  })

  test('returns locked margin to available after cancel', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    const orderRes = await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    const { orderId } = await orderRes.json()

    const userBefore = users[0]
    expect(userBefore.collateral.available).toBe(9500)
    expect(userBefore.collateral.locked).toBe(500)

    await fetch(`${BASE}/order`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    })

    const userAfter = users[0]
    expect(userAfter.collateral.available).toBe(10000)
    expect(userAfter.collateral.locked).toBe(0)
  })

  test('returns 400 for missing orderId', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/order`, {
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

  test('returns 400 for non-existent orderId', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/order`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId: 99999 }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Order not found')
  })

  test('returns 400 when trying to cancel a filled order', async () => {
    // User 1 places a sell at market price so it gets filled by user 2's buy
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice places a limit sell at 90 (SOL lastTradedPrice)
    const sellRes = await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })
    const sellOrder = await sellRes.json()

    // Bob buys at 90, matching alice's sell
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })

    // Try to cancel Alice's now-filled order
    const res = await fetch(`${BASE}/order`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ orderId: sellOrder.orderId }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Can not cancel the order with current status')
  })

  test('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/order`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 1 }),
    })

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────
// ORDER MATCHING (ENGINE)
// ─────────────────────────────────────────────

describe('Order matching', () => {
  test('buy order matches with existing sell order at same price', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice places sell at 90
    const sellRes = await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })
    const sellOrder = await sellRes.json()
    expect(sellOrder.status).toBe('open') // no buyer yet

    // Bob buys at 90
    const buyRes = await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })
    const buyOrder = await buyRes.json()
    expect(buyOrder.status).toBe('filled')
    expect(buyOrder.filledQty).toBe(5)

    // Verify fill was created
    expect(fills.length).toBe(1)
    expect(fills[0].qty).toBe(5)
    expect(fills[0].price).toBe(90)
    expect(fills[0].market).toBe('SOL')
  })

  test('partial fill when buy qty exceeds sell qty', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice sells 3
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })

    // Bob buys 5 — should partially fill 3
    const buyRes = await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    const buyOrder = await buyRes.json()
    expect(buyOrder.status).toBe('partial')
    expect(buyOrder.filledQty).toBe(3)
  })

  test('limit buy does not match higher ask price', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice sells at 95
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 400,
    })

    // Bob bids at 85 — should NOT match
    const buyRes = await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 400,
    })
    const buyOrder = await buyRes.json()
    expect(buyOrder.status).toBe('open')
    expect(buyOrder.filledQty).toBe(0)
    expect(fills.length).toBe(0)
  })

  test('market order matches at best available price', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice sells at 88
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 88,
      margin: 400,
    })

    // Bob market buys — fills against Alice's resting sell at 88
    const buyRes = await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'market',
      price: 0,
      margin: 400,
    })
    const buyOrder = await buyRes.json()
    expect(buyOrder.status).toBe('filled')
    // Response price is the effectivePrice (lastTradedPrice=90), not the fill price
    expect(buyOrder.price).toBe(90)
    // But the actual fill is at the resting order's price (88)
    expect(fills.length).toBe(1)
    expect(fills[0].price).toBe(88)
  })

  test('update positions after a fill', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice sells 5 SOL at 90
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })

    // Bob buys 5 SOL at 90
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })

    // Check Alice has SHORT position
    const aliceUser = users.find(u => u.username === 'alice')!
    expect(aliceUser.positions.length).toBe(1)
    expect(aliceUser.positions[0].type).toBe('SHORT')
    expect(aliceUser.positions[0].qty).toBe(5)
    expect(aliceUser.positions[0].averagePrice).toBe(90)
    expect(aliceUser.positions[0].status).toBe('open')

    // Check Bob has LONG position
    const bobUser = users.find(u => u.username === 'bob')!
    expect(bobUser.positions.length).toBe(1)
    expect(bobUser.positions[0].type).toBe('LONG')
    expect(bobUser.positions[0].qty).toBe(5)
    expect(bobUser.positions[0].averagePrice).toBe(90)
    expect(bobUser.positions[0].status).toBe('open')
  })

  test('updates lastTradedPrice on the orderbook after fill', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    const initialPrice = orderbooks.SOL.lastTradedPrice

    // Trade at a different price
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 2,
      orderType: 'limit',
      price: 95,
      margin: 200,
    })

    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 2,
      orderType: 'limit',
      price: 95,
      margin: 200,
    })

    expect(orderbooks.SOL.lastTradedPrice).toBe(95)
    expect(orderbooks.SOL.lastTradedPrice).not.toBe(initialPrice)
  })

  test('multiple orders can stack at same price level', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    // Alice and Bob both sell at 90
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 2,
      orderType: 'limit',
      price: 90,
      margin: 200,
    })

    // Charlie buys 5 — should match both
    const buyRes = await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    const buyOrder = await buyRes.json()
    expect(buyOrder.status).toBe('filled')
    expect(buyOrder.filledQty).toBe(5)
    expect(fills.length).toBe(2)
  })

  test('position averaging when adding to same side', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    // Bob sells 3 at 90
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })

    // Charlie sells 3 at 95
    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 95,
      margin: 300,
    })

    // Alice buys 3 at 90
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })

    // Alice buys 3 at 95
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 3,
      orderType: 'limit',
      price: 95,
      margin: 300,
    })

    const aliceUser = users.find(u => u.username === 'alice')!
    expect(aliceUser.positions.length).toBe(1)
    expect(aliceUser.positions[0].qty).toBe(6)
    // average price = (90*3 + 95*3) / 6 = 92.5
    expect(aliceUser.positions[0].averagePrice).toBeCloseTo(92.5, 2)
  })

  test('closing a LONG position via SHORT order returns margin and PnL', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Bob sells 5 at 90 (resting SHORT)
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Alice buys 5 at 90 → fills Bob's sell → Alice gets LONG 5 at 90
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    const aliceUser = users.find(u => u.username === 'alice')!
    expect(aliceUser.positions.length).toBe(1)
    expect(aliceUser.positions[0].type).toBe('LONG')
    expect(aliceUser.positions[0].qty).toBe(5)
    expect(aliceUser.positions[0].averagePrice).toBe(90)

    // Now Bob places a buy at 95 (resting LONG bid)
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })

    // Alice sells 5 at 95 → matches Bob's bid → closes Alice's LONG
    const closeRes = await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })
    const closeOrder = await closeRes.json()
    expect(closeOrder.status).toBe('filled')

    // Alice's LONG position should be closed
    expect(aliceUser.positions[0].status).toBe('closed')
    // PnL = (95 - 90) * 5 = 25 (profit)
    expect(aliceUser.positions[0].pnL).toBe(25)
  })

  test('closing a SHORT position via LONG order returns margin and PnL', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice sells 5 at 90 (opens SHORT)
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    const aliceUser = users.find(u => u.username === 'alice')!
    expect(aliceUser.positions[0].type).toBe('SHORT')
    expect(aliceUser.positions[0].averagePrice).toBe(90)

    // Price drops to 80 — Alice profits on SHORT
    // Bob places a sell at 80 (resting SHORT ask)
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 80,
      margin: 500,
    })

    // Alice buys at 80 → closes SHORT
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 80,
      margin: 500,
    })

    expect(aliceUser.positions[0].status).toBe('closed')
    // SHORT PnL = -(80 - 90) * 5 = 50 (profit, price went down)
    expect(aliceUser.positions[0].pnL).toBe(50)
  })

  test('liquidation price is set correctly for LONG and SHORT', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice LONG at 100
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 100,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 100,
      margin: 500,
    })

    const aliceUser = users.find(u => u.username === 'alice')!
    expect(aliceUser.positions[0].liquidationPrice).toBe(80) // 100 * 0.8
    expect(aliceUser.positions[0].type).toBe('LONG')

    // Bob SHORT at 100
    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 100,
      margin: 500,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 100,
      margin: 500,
    })

    const bobUser = users.find(u => u.username === 'bob')!
    expect(bobUser.positions[0].liquidationPrice).toBe(120) // 100 * 1.2
    expect(bobUser.positions[0].type).toBe('SHORT')
  })
})

// ─────────────────────────────────────────────
// ACCOUNT ENDPOINTS
// ─────────────────────────────────────────────

describe('GET /equity/available', () => {
  test('returns 0 equity for new user', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalEquity).toBe(0)
  })

  test('returns equity equal to collateral when no positions', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 5000)

    const res = await fetch(`${BASE}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalEquity).toBe(5000)
  })

  test('returns equity including unrealized PnL', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Bob sells 5 at 85
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    // Alice buys 5 at 85 → LONG 5 at 85
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    // After fill: collateral.locked goes to 0 (margin transferred to position)
    // collateral.available = 9500, collateral.locked = 0
    // Position margin = 500 (tracked in position, not in collateral.locked)

    // Mark price moved to 90 → unrealized PnL = (90-85)*5 = 25
    orderbooks.SOL.lastTradedPrice = 90

    const res = await fetch(`${BASE}/equity/available`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    // equity = available(9500) + locked(0) + unrealizedPnl(25) = 9525
    // Note: margin is tracked in position.margin, not collateral.locked
    expect(body.totalEquity).toBe(9525)
  })

  test('equity with no positions and no collateral is 0', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalEquity).toBe(0)
  })

  test('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/equity/available`)
    expect(res.status).toBe(401)
  })
})

describe('GET /positions/open/:marketId', () => {
  test('returns open positions for a market', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Create a position for Alice
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    const res = await fetch(`${BASE}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions.length).toBe(1)
    expect(body.positions[0].type).toBe('LONG')
    expect(body.positions[0].qty).toBe(5)
    expect(body.positions[0].status).not.toBe('closed')
  })

  test('returns empty array when no positions exist', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions.length).toBe(0)
  })

  test('does not return closed positions', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    // Alice opens LONG 5 at 90
    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Alice closes LONG via SHORT
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })

    const res = await fetch(`${BASE}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions.length).toBe(0)
  })

  test('returns positions only for specified market', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Open position on SOL
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Open position on ETH
    await placeOrder(bob.token, {
      market: 'ETH',
      type: 'SHORT',
      qty: 1,
      orderType: 'limit',
      price: 1900,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'ETH',
      type: 'LONG',
      qty: 1,
      orderType: 'limit',
      price: 1900,
      margin: 500,
    })

    const res = await fetch(`${BASE}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions.length).toBe(1)
    expect(body.positions[0].market).toBe('SOL')
  })

  test('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/positions/open/SOL`)
    expect(res.status).toBe(401)
  })
})

describe('GET /positions/closed/:marketId', () => {
  test('returns closed positions for a market', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    // Open
    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Close
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })

    const res = await fetch(`${BASE}/positions/closed/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions.length).toBe(1)
    expect(body.positions[0].status).toBe('closed')
    expect(body.positions[0].pnL).toBe(25)
  })

  test('returns empty array when no closed positions', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/positions/closed/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions.length).toBe(0)
  })

  test('returns only closed, not open positions', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    // Open first position
    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Close it
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 500,
    })

    // Open second position (keep it open)
    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 100,
      margin: 300,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 3,
      orderType: 'limit',
      price: 100,
      margin: 300,
    })

    const closedRes = await fetch(`${BASE}/positions/closed/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })
    const closedBody = await closedRes.json()
    expect(closedBody.positions.length).toBe(1)
    expect(closedBody.positions[0].status).toBe('closed')

    const openRes = await fetch(`${BASE}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })
    const openBody = await openRes.json()
    expect(openBody.positions.length).toBe(1)
    expect(openBody.positions[0].status).not.toBe('closed')
  })
})

describe('GET /orders/open/:marketId', () => {
  test('returns open orders for a market', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    const res = await fetch(`${BASE}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openOrders.length).toBe(1)
    expect(body.openOrders[0].status).toBe('open')
  })

  test('does not return filled or cancelled orders', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Place and immediately fill an order
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    const res = await fetch(`${BASE}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openOrders.length).toBe(0)
  })

  test('returns empty array when no orders exist', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openOrders.length).toBe(0)
  })

  test('returns partial orders as open', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Alice sells 3 at 90
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })

    // Bob buys 5 at 90 → partial fill
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    const res = await fetch(`${BASE}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openOrders.length).toBe(1)
    expect(body.openOrders[0].status).toBe('partial')
    expect(body.openOrders[0].filledQty).toBe(3)
  })

  test('returns only orders for specified market', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 400,
    })
    await placeOrder(token, {
      market: 'ETH',
      type: 'LONG',
      qty: 1,
      orderType: 'limit',
      price: 1800,
      margin: 400,
    })

    const res = await fetch(`${BASE}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openOrders.length).toBe(1)
    expect(body.openOrders[0].market).toBe('SOL')
  })
})

describe('GET /orders/:marketId', () => {
  test('returns all orders for a market', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    // Alice places two orders on SOL
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 400,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 95,
      margin: 300,
    })

    const res = await fetch(`${BASE}/orders/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders.length).toBe(2)
  })

  test('does not return orders from other markets', async () => {
    await signup()
    const { token } = await signin()
    await onboard(token, 10000)

    await placeOrder(token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 400,
    })
    await placeOrder(token, {
      market: 'ETH',
      type: 'LONG',
      qty: 1,
      orderType: 'limit',
      price: 1800,
      margin: 400,
    })

    const res = await fetch(`${BASE}/orders/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders.length).toBe(1)
    expect(body.orders[0].market).toBe('SOL')
  })

  test('includes filled and cancelled orders', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Order 1: Alice sells → gets filled by Bob
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })

    // Order 2: Alice places and cancels
    const cancelOrderRes = await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 2,
      orderType: 'limit',
      price: 85,
      margin: 200,
    })
    const { orderId } = await cancelOrderRes.json()
    await fetch(`${BASE}/order`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ orderId }),
    })

    const res = await fetch(`${BASE}/orders/SOL`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders.length).toBe(2)

    const statuses = body.orders.map((o: any) => o.status)
    expect(statuses).toContain('filled')
    expect(statuses).toContain('cancelled')
  })

  test('returns empty array when no orders exist', async () => {
    await signup()
    const { token } = await signin()

    const res = await fetch(`${BASE}/orders/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders.length).toBe(0)
  })

  test('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/orders/SOL`)
    expect(res.status).toBe(401)
  })
})

describe('GET /fills', () => {
  test('returns all fills', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Create a fill
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 3,
      orderType: 'limit',
      price: 90,
      margin: 300,
    })

    const res = await fetch(`${BASE}/fills`)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
    expect(body[0].qty).toBe(3)
    expect(body[0].price).toBe(90)
    expect(body[0].market).toBe('SOL')
  })

  test('filters fills by market query param', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Fill on SOL
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 2,
      orderType: 'limit',
      price: 90,
      margin: 200,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 2,
      orderType: 'limit',
      price: 90,
      margin: 200,
    })

    // Fill on ETH
    await placeOrder(alice.token, {
      market: 'ETH',
      type: 'SHORT',
      qty: 1,
      orderType: 'limit',
      price: 1900,
      margin: 200,
    })
    await placeOrder(bob.token, {
      market: 'ETH',
      type: 'LONG',
      qty: 1,
      orderType: 'limit',
      price: 1900,
      margin: 200,
    })

    const res = await fetch(`${BASE}/fills?market=SOL`)
    const body = await res.json()
    expect(body.length).toBe(1)
    expect(body[0].market).toBe('SOL')

    const resEth = await fetch(`${BASE}/fills?market=ETH`)
    const bodyEth = await resEth.json()
    expect(bodyEth.length).toBe(1)
    expect(bodyEth[0].market).toBe('ETH')
  })

  test('returns empty array when no fills exist', async () => {
    const res = await fetch(`${BASE}/fills`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(0)
  })

  test('does not require authentication', async () => {
    const res = await fetch(`${BASE}/fills`)
    expect(res.status).toBe(200)
  })

  test('returns fill details with maker, taker, long, short', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    // Bob sells (maker), Alice buys (taker)
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    const res = await fetch(`${BASE}/fills`)
    const body = await res.json()
    expect(body.length).toBe(1)

    const fill = body[0]
    expect(fill.maker).toBe(2) // Bob (userId 2)
    expect(fill.taker).toBe(1) // Alice (userId 1)
    expect(fill.long).toBe(1)  // Alice is LONG
    expect(fill.short).toBe(2) // Bob is SHORT
    expect(fill.market).toBe('SOL')
    expect(fill.qty).toBe(5)
    expect(fill.price).toBe(90)
    expect(fill.fillId).toBeDefined()
  })

  test('returns multiple fills in chronological order', async () => {
    await signup('alice', 'pass1')
    const alice = await signin('alice', 'pass1')
    await onboard(alice.token, 10000)

    await signup('bob', 'pass2')
    const bob = await signin('bob', 'pass2')
    await onboard(bob.token, 10000)

    await signup('charlie', 'pass3')
    const charlie = await signin('charlie', 'pass3')
    await onboard(charlie.token, 10000)

    // First trade: Alice sells 2 to Bob
    await placeOrder(alice.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 2,
      orderType: 'limit',
      price: 90,
      margin: 200,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 2,
      orderType: 'limit',
      price: 90,
      margin: 200,
    })

    // Second trade: Charlie sells 3 to Bob
    await placeOrder(charlie.token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 3,
      orderType: 'limit',
      price: 92,
      margin: 300,
    })
    await placeOrder(bob.token, {
      market: 'SOL',
      type: 'LONG',
      qty: 3,
      orderType: 'limit',
      price: 92,
      margin: 300,
    })

    const res = await fetch(`${BASE}/fills`)
    const body = await res.json()
    expect(body.length).toBe(2)
    expect(body[0].price).toBe(90)
    expect(body[1].price).toBe(92)
    // IDs should be sequential
    expect(body[1].fillId).toBeGreaterThan(body[0].fillId)
  })
})
