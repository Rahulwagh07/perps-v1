import { describe, test, expect, beforeEach } from 'bun:test'
import request from 'supertest'
import { app } from './index'
import { resetStore } from './store'

beforeEach(() => {
  resetStore()
})

// ─── Helper ────────────────────────────────────────────────────────

async function signup(username: string, password: string) {
  const res = await request(app).post('/signup').send({ username, password })
  return res
}

async function signin(username: string, password: string) {
  const res = await request(app).post('/signin').send({ username, password })
  return res
}

async function authedGet(
  token: string,
  path: string,
): Promise<request.Response> {
  return request(app).get(path).set('Authorization', `Bearer ${token}`)
}

async function authedPost(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

async function authedDelete(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .delete(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

/** Sign up + sign in, return token */
async function createUser(username = 'alice', password = 'pass123') {
  await signup(username, password)
  const res = await signin(username, password)
  return res.body.token as string
}

// ═══════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

describe('POST /signup', () => {
  test('creates a new user and returns userId + username', async () => {
    const res = await signup('alice', 'pass123')
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe(1)
    expect(res.body.username).toBe('alice')
  })

  test('returns 400 when username is missing', async () => {
    const res = await request(app).post('/signup').send({ password: 'pass' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('username and password are required')
  })

  test('returns 400 when password is missing', async () => {
    const res = await request(app).post('/signup').send({ username: 'alice' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('username and password are required')
  })

  test('returns 409 when username is already taken', async () => {
    await signup('alice', 'pass123')
    const res = await signup('alice', 'other')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('username is already taken')
  })

  test('can create multiple distinct users', async () => {
    const r1 = await signup('alice', 'p1')
    const r2 = await signup('bob', 'p2')
    expect(r1.body.userId).toBe(1)
    expect(r2.body.userId).toBe(2)
  })
})

describe('POST /signin', () => {
  test('returns a token for valid credentials', async () => {
    await signup('alice', 'pass123')
    const res = await signin('alice', 'pass123')
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(typeof res.body.token).toBe('string')
  })

  test('returns 401 for wrong password', async () => {
    await signup('alice', 'pass123')
    const res = await signin('alice', 'wrong')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid credentials')
  })

  test('returns 401 for non-existent user', async () => {
    const res = await signin('nobody', 'pass')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid credentials')
  })
})

describe('POST /onramp', () => {
  test('adds collateral to authenticated user', async () => {
    const token = await createUser('alice', 'pass123')
    const res = await authedPost(token, '/onramp', { amount: 1000 })
    expect(res.status).toBe(200)
    expect(res.body.collateral.available).toBe(1000)
    expect(res.body.collateral.locked).toBe(0)
  })

  test('accumulates collateral on multiple onramps', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 500 })
    const res = await authedPost(token, '/onramp', { amount: 500 })
    expect(res.body.collateral.available).toBe(1000)
  })

  test('returns 400 when amount is missing', async () => {
    const token = await createUser()
    const res = await authedPost(token, '/onramp', {})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Amount must be a positive number')
  })

  test('returns 400 when amount is negative', async () => {
    const token = await createUser()
    const res = await authedPost(token, '/onramp', { amount: -10 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Amount must be a positive number')
  })

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/onramp').send({ amount: 100 })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Unauthorized')
  })

  test('returns 401 with invalid token', async () => {
    const res = await request(app)
      .post('/onramp')
      .set('Authorization', 'Bearer fake-token')
      .send({ amount: 100 })
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════
// ORDER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

describe('POST /order', () => {
  test('places a limit buy order and returns 201', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 10000 })

    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    expect(res.status).toBe(201)
    expect(res.body.orderId).toBeDefined()
    expect(res.body.status).toBe('open')
    expect(res.body.filledQty).toBe(0)
    expect(res.body.price).toBe(85)
  })

  test('places a market sell order', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 10000 })

    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'market',
      margin: 300,
    })

    expect(res.status).toBe(201)
    expect(res.body.orderId).toBeDefined()
    // market order uses lastTradedPrice from orderbook
    expect(res.body.price).toBe(90)
  })

  test('returns 400 for missing required fields', async () => {
    const token = await createUser()
    const res = await authedPost(token, '/order', { market: 'SOL' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing required fields')
  })

  test('returns 400 for invalid type', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 1000 })
    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'INVALID',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 100,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('type must be LONG or SHORT')
  })

  test('returns 400 for invalid orderType', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 1000 })
    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'stop',
      price: 85,
      margin: 100,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('orderType must be limit or market')
  })

  test('returns 400 for insufficient balance', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 100 }) // only 100
    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500, // need 500
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('insufficient balance')
  })

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/order').send({
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    expect(res.status).toBe(401)
  })

  test('deducts margin from available collateral', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 1000 })

    await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    const equityRes = await authedGet(token, '/equity/available')
    // equity = available(500) + locked(500) = 1000
    expect(equityRes.body.totalEquity).toBe(1000)
  })

  test('limit buy order requires price', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 10000 })

    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      margin: 500,
      // no price
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('price is req for limit orders')
  })
})

describe('DELETE /order', () => {
  test('cancels an open order and returns margin', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 10000 })

    const placeRes = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    const orderId = placeRes.body.orderId

    const cancelRes = await authedDelete(token, '/order', { orderId })
    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.message).toBe('order cancelled')
    expect(cancelRes.body.marginToReturned).toBe(500)
  })

  test('returns 400 when orderId is missing', async () => {
    const token = await createUser()
    const res = await authedDelete(token, '/order', {})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Orderid is required')
  })

  test('returns 400 when order not found', async () => {
    const token = await createUser()
    const res = await authedDelete(token, '/order', { orderId: 999 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Order not found')
  })

  test('returns 400 when trying to cancel a filled order', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice places a limit sell at 85
    const sellRes = await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    const sellOrderId = sellRes.body.orderId

    // Bob places a limit buy at 85 → should match and fill
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    // Try to cancel the now-filled order
    const res = await authedDelete(token1, '/order', { orderId: sellOrderId })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Can not cancel/)
  })

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).delete('/order').send({ orderId: 1 })
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════
// ORDER MATCHING (ENGINE)
// ═══════════════════════════════════════════════════════════════════

describe('Order matching', () => {
  test('limit buy fills against resting limit sell at same price', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice sells
    const sellRes = await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    expect(sellRes.body.status).toBe('open')

    // Bob buys → should fill
    const buyRes = await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    expect(buyRes.body.status).toBe('filled')
    expect(buyRes.body.filledQty).toBe(10)
  })

  test('limit buy does not fill against higher ask price', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice sells at 90
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1000,
    })

    // Bob buys at 85 → should NOT fill (buy price < ask price)
    const buyRes = await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    expect(buyRes.body.status).toBe('open')
    expect(buyRes.body.filledQty).toBe(0)
  })

  test('partial fill when incoming qty < resting qty', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice sells 10 at 85
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    // Bob buys only 5 at 85 → partial fill
    const buyRes = await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    expect(buyRes.body.status).toBe('filled')
    expect(buyRes.body.filledQty).toBe(5)
  })

  test('partial fill when resting qty < incoming qty', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice sells 5 at 85
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    // Bob buys 10 at 85 → partial fill (only 5 matched)
    const buyRes = await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    expect(buyRes.body.status).toBe('partial')
    expect(buyRes.body.filledQty).toBe(5)
  })

  test('market order fills at lastTradedPrice', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 50000 })

    const res = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'market',
      margin: 500,
    })
    expect(res.status).toBe(201)
    expect(res.body.price).toBe(90) // lastTradedPrice of SOL
  })

  test('fill creates record in fills array', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const fillsRes = await request(app).get('/fills')
    expect(fillsRes.status).toBe(200)
    expect(fillsRes.body.length).toBe(1)
    expect(fillsRes.body[0].market).toBe('SOL')
    expect(fillsRes.body[0].qty).toBe(10)
    expect(fillsRes.body[0].price).toBe(85)
  })

  test('long and short users are correct on fill', async () => {
    const token1 = await createUser('alice', 'p1') // will sell (short)
    const token2 = await createUser('bob', 'p2') // will buy (long)
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const fillsRes = await request(app).get('/fills')
    const fill = fillsRes.body[0]
    // alice is short (userId 1), bob is long (userId 2)
    expect(fill.short).toBe(1)
    expect(fill.long).toBe(2)
    expect(fill.maker).toBe(1) // alice resting
    expect(fill.taker).toBe(2) // bob incoming
  })

  test('cancelled order is skipped by engine', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice places sell
    const sellRes = await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    // Alice cancels
    await authedDelete(token1, '/order', { orderId: sellRes.body.orderId })

    // Bob buys → should NOT fill because Alice's order is cancelled
    const buyRes = await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    expect(buyRes.body.status).toBe('open')
    expect(buyRes.body.filledQty).toBe(0)
  })

  test('order matching with multiple price levels (price-time priority)', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    const token3 = await createUser('charlie', 'p3')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })
    await authedPost(token3, '/onramp', { amount: 50000 })

    // Alice sells 5 at 84 (cheapest)
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 84,
      margin: 500,
    })

    // Bob sells 5 at 86
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 86,
      margin: 500,
    })

    // Charlie buys 10 at 86 → should match cheapest first (84 then 86)
    const buyRes = await authedPost(token3, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 86,
      margin: 1000,
    })
    expect(buyRes.body.status).toBe('filled')
    expect(buyRes.body.filledQty).toBe(10)

    // 2 fills should exist
    const fillsRes = await request(app).get('/fills?market=SOL')
    expect(fillsRes.body.length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════
// ACCOUNT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

describe('GET /equity/available', () => {
  test('returns total equity for user with collateral only', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 5000 })

    const res = await authedGet(token, '/equity/available')
    expect(res.status).toBe(200)
    expect(res.body.totalEquity).toBe(5000)
  })

  test('returns equity including locked margin', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 5000 })

    await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const res = await authedGet(token, '/equity/available')
    // available = 4000, locked = 1000
    expect(res.body.totalEquity).toBe(5000)
  })

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/equity/available')
    expect(res.status).toBe(401)
  })
})

describe('GET /positions/open/:marketId', () => {
  test('returns open positions for authenticated user', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Create a matching trade so positions open
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const res = await authedGet(token1, '/positions/open/SOL')
    expect(res.status).toBe(200)
    expect(res.body.positions.length).toBe(1)
    expect(res.body.positions[0].type).toBe('SHORT')
    expect(res.body.positions[0].market).toBe('SOL')
  })

  test('returns empty array when no positions', async () => {
    const token = await createUser()
    const res = await authedGet(token, '/positions/open/SOL')
    expect(res.status).toBe(200)
    expect(res.body.positions).toEqual([])
  })

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/positions/open/SOL')
    expect(res.status).toBe(401)
  })
})

describe('GET /positions/closed/:marketId', () => {
  test('returns closed positions', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice opens a SHORT position
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })
    // Bob matches
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    // Now Alice closes with a LONG buy
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1000,
    })
    // Bob sells to close
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1000,
    })

    const res = await authedGet(token1, '/positions/closed/SOL')
    expect(res.status).toBe(200)
    expect(res.body.positions.length).toBe(1)
    expect(res.body.positions[0].status).toBe('closed')
  })

  test('returns empty array when no closed positions', async () => {
    const token = await createUser()
    const res = await authedGet(token, '/positions/closed/SOL')
    expect(res.status).toBe(200)
    expect(res.body.positions).toEqual([])
  })
})

describe('GET /orders/open/:marketId', () => {
  test('returns only open/partial orders', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 50000 })

    await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const res = await authedGet(token, '/orders/open/SOL')
    expect(res.status).toBe(200)
    expect(res.body.openOrders.length).toBe(1)
    expect(res.body.openOrders[0].status).toBe('open')
  })

  test('does not return cancelled orders', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 50000 })

    const placeRes = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    await authedDelete(token, '/order', { orderId: placeRes.body.orderId })

    const res = await authedGet(token, '/orders/open/SOL')
    expect(res.body.openOrders.length).toBe(0)
  })

  test('returns empty array for different market', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 50000 })

    await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const res = await authedGet(token, '/orders/open/ETH')
    expect(res.body.openOrders.length).toBe(0)
  })
})

describe('GET /orders/:marketId', () => {
  test('returns all orders for a market', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 50000 })

    await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    const res = await authedGet(token, '/orders/SOL')
    expect(res.status).toBe(200)
    expect(res.body.orders.length).toBe(1)
  })

  test('returns cancelled orders too', async () => {
    const token = await createUser()
    await authedPost(token, '/onramp', { amount: 50000 })

    const placeRes = await authedPost(token, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 1000,
    })

    await authedDelete(token, '/order', { orderId: placeRes.body.orderId })

    const res = await authedGet(token, '/orders/SOL')
    expect(res.body.orders.length).toBe(1)
    expect(res.body.orders[0].status).toBe('cancelled')
  })

  test('returns empty array for market with no orders', async () => {
    const token = await createUser()
    const res = await authedGet(token, '/orders/ETH')
    expect(res.status).toBe(200)
    expect(res.body.orders).toEqual([])
  })

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/orders/SOL')
    expect(res.status).toBe(401)
  })
})

describe('GET /fills', () => {
  test('returns all fills when no market filter', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // SOL trade
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    // ETH trade
    await authedPost(token1, '/order', {
      market: 'ETH',
      type: 'SHORT',
      qty: 2,
      orderType: 'limit',
      price: 1900,
      margin: 500,
    })
    await authedPost(token2, '/order', {
      market: 'ETH',
      type: 'LONG',
      qty: 2,
      orderType: 'limit',
      price: 1900,
      margin: 500,
    })

    const res = await request(app).get('/fills')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  test('filters fills by market', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    const res = await request(app).get('/fills?market=SOL')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(res.body[0].market).toBe('SOL')
  })

  test('returns empty array when no fills', async () => {
    const res = await request(app).get('/fills')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('does not require authentication', async () => {
    const res = await request(app).get('/fills')
    expect(res.status).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════
// POSITION UTILITIES
// ═══════════════════════════════════════════════════════════════════

describe('Position lifecycle', () => {
  test('opening a long position creates correct position data', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })

    const res = await authedGet(token2, '/positions/open/SOL')
    const pos = res.body.positions[0]
    expect(pos.type).toBe('LONG')
    expect(pos.qty).toBe(10)
    expect(pos.averagePrice).toBe(100)
    expect(pos.liquidationPrice).toBe(80) // 100 * 0.8
    expect(pos.market).toBe('SOL')
  })

  test('opening a short position creates correct position data', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })

    const res = await authedGet(token1, '/positions/open/SOL')
    const pos = res.body.positions[0]
    expect(pos.type).toBe('SHORT')
    expect(pos.qty).toBe(10)
    expect(pos.averagePrice).toBe(100)
    expect(pos.liquidationPrice).toBe(120) // 100 * 1.2
  })

  test('closing a position moves it to closed with pnl', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Alice SHORT at 100
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })

    // Alice LONG at 90 (closing SHORT with profit)
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1000,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1000,
    })

    // Open positions should be empty
    const openRes = await authedGet(token1, '/positions/open/SOL')
    expect(openRes.body.positions.length).toBe(0)

    // Closed positions should have 1
    const closedRes = await authedGet(token1, '/positions/closed/SOL')
    expect(closedRes.body.positions.length).toBe(1)
    expect(closedRes.body.positions[0].status).toBe('closed')
    // SHORT from 100, closed at 90 → profit of (100-90)*10 = 100
    expect(closedRes.body.positions[0].pnL).toBe(100)
  })

  test('accumulating positions updates average price', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // First trade: Alice LONG 5 at 100
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 100,
      margin: 500,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 100,
      margin: 500,
    })

    // Second trade: Bob LONG 5 at 110
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 110,
      margin: 500,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 110,
      margin: 500,
    })

    const res = await authedGet(token2, '/positions/open/SOL')
    expect(res.body.positions.length).toBe(1)
    expect(res.body.positions[0].qty).toBe(10)
    // average = (100*5 + 110*5) / 10 = 105
    expect(res.body.positions[0].averagePrice).toBe(105)
  })
})

// ═══════════════════════════════════════════════════════════════════
// EQUITY CALCULATION
// ═══════════════════════════════════════════════════════════════════

describe('Equity calculation', () => {
  test('equity includes unrealized PnL', async () => {
    const token1 = await createUser('alice', 'p1')
    const token2 = await createUser('bob', 'p2')
    await authedPost(token1, '/onramp', { amount: 50000 })
    await authedPost(token2, '/onramp', { amount: 50000 })

    // Bob LONG 10 at 100
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1000,
    })

    // Price moves to 110 via new trade
    await authedPost(token1, '/order', {
      market: 'SOL',
      type: 'SHORT',
      qty: 1,
      orderType: 'limit',
      price: 110,
      margin: 100,
    })
    await authedPost(token2, '/order', {
      market: 'SOL',
      type: 'LONG',
      qty: 1,
      orderType: 'limit',
      price: 110,
      margin: 100,
    })

    // Bob's equity: available(48900) + locked(1000) + unrealizedPnl((110-100)*10 = 100)
    const res = await authedGet(token2, '/equity/available')
    expect(res.body.totalEquity).toBe(49000) // 48900 + 100 + 1000 = 50000
  })
})

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe('Middleware', () => {
  test('missing Authorization header returns 401', async () => {
    const res = await request(app).get('/equity/available')
    expect(res.status).toBe(401)
  })

  test('malformed Authorization header returns 401', async () => {
    const res = await request(app)
      .get('/equity/available')
      .set('Authorization', 'InvalidFormat')
    expect(res.status).toBe(401)
  })

  test('expired/unknown token returns 401', async () => {
    const res = await request(app)
      .get('/equity/available')
      .set('Authorization', 'Bearer non-existent-token')
    expect(res.status).toBe(401)
  })
})
