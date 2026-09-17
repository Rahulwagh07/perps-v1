import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import {
  startServer,
  stopServer,
  resetState,
  signUp,
  signIn,
  onramp,
  placeOrder,
  cancelOrder,
  authHeaders,
} from './helpers'

let url: string

beforeAll(async () => {
  url = await startServer()
})

afterAll(async () => {
  await stopServer()
})

beforeEach(() => {
  resetState()
})

async function setupUser(username: string, collateral: number) {
  await signUp(url, username, 'pass123')
  const { body } = await signIn(url, username, 'pass123')
  await onramp(url, body.token, collateral)
  return body.token
}

describe('GET /equity/available', () => {
  test('should return equity with collateral only', async () => {
    const token = await setupUser('alice', 1000)
    const res = await fetch(`${url}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalEquity).toBe(1000)
  })

  test('should return 0 equity for new user with no collateral', async () => {
    await signUp(url, 'alice', 'pass123')
    const { body } = await signIn(url, 'alice', 'pass123')
    const res = await fetch(`${url}/equity/available`, {
      headers: { Authorization: `Bearer ${body.token}` },
    })
    expect(res.status).toBe(200)
    const equityBody = await res.json()
    expect(equityBody.totalEquity).toBe(0)
  })

  test('should return 401 without auth', async () => {
    const res = await fetch(`${url}/equity/available`)
    expect(res.status).toBe(401)
  })
})

describe('GET /positions/open/:marketId', () => {
  test('should return empty positions for new user', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions).toEqual([])
  })

  test('should return open positions after a fill', async () => {
    const aliceToken = await setupUser('alice', 5000)
    const bobToken = await setupUser('bob', 5000)

    // Alice places a limit sell at 90
    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Bob buys market → fills Alice's order
    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    // Check Bob's open positions
    const res = await fetch(`${url}/positions/open/SOL`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    })
    const body = await res.json()
    expect(body.positions.length).toBe(1)
    expect(body.positions[0].market).toBe('SOL')
    expect(body.positions[0].type).toBe('LONG')
    expect(body.positions[0].qty).toBe(10)
    expect(body.positions[0].averagePrice).toBe(90)
  })

  test('should return 401 without auth', async () => {
    const res = await fetch(`${url}/positions/open/SOL`)
    expect(res.status).toBe(401)
  })
})

describe('GET /positions/closed/:marketId', () => {
  test('should return empty closed positions initially', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/positions/closed/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.positions).toEqual([])
  })

  test('should return closed positions after closing', async () => {
    const aliceToken = await setupUser('alice', 5000)
    const bobToken = await setupUser('bob', 5000)

    // Alice opens a SHORT
    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Bob buys → fills Alice (Alice gets SHORT position)
    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    // Alice closes her SHORT by buying LONG
    // Need a resting sell order to fill against
    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    // Check Alice's closed positions
    const res = await fetch(`${url}/positions/closed/SOL`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    const body = await res.json()
    expect(body.positions.length).toBe(1)
    expect(body.positions[0].status).toBe('closed')
    expect(body.positions[0].type).toBe('SHORT')
  })

  test('should filter by market', async () => {
    const aliceToken = await setupUser('alice', 5000)
    const bobToken = await setupUser('bob', 5000)

    // Create a fill on SOL
    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    // Check ETH closed positions (should be empty)
    const res = await fetch(`${url}/positions/closed/ETH`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    const body = await res.json()
    expect(body.positions).toEqual([])
  })
})

describe('GET /orders/open/:marketId', () => {
  test('should return empty open orders initially', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openOrders).toEqual([])
  })

  test('should return open orders after placing', async () => {
    const token = await setupUser('alice', 5000)
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    const res = await fetch(`${url}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.openOrders.length).toBe(1)
    expect(body.openOrders[0].status).toBe('open')
    expect(body.openOrders[0].market).toBe('SOL')
  })

  test('should not include cancelled orders', async () => {
    const token = await setupUser('alice', 5000)
    const { body: orderBody } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    await cancelOrder(url, token, orderBody.orderId)

    const res = await fetch(`${url}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.openOrders).toEqual([])
  })

  test('should not include filled orders', async () => {
    const aliceToken = await setupUser('alice', 5000)
    const bobToken = await setupUser('bob', 5000)

    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    const res = await fetch(`${url}/orders/open/SOL`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    const body = await res.json()
    expect(body.openOrders).toEqual([])
  })

  test('should filter by market', async () => {
    const token = await setupUser('alice', 5000)
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })

    const res = await fetch(`${url}/orders/open/ETH`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.openOrders).toEqual([])
  })
})

describe('GET /orders/:marketId', () => {
  test('should return all orders for a market', async () => {
    const token = await setupUser('alice', 5000)
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 80,
      margin: 250,
    })

    const res = await fetch(`${url}/orders/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.orders.length).toBe(2)
  })

  test('should include cancelled orders', async () => {
    const token = await setupUser('alice', 5000)
    const { body: orderBody } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 85,
      margin: 500,
    })
    await cancelOrder(url, token, orderBody.orderId)

    const res = await fetch(`${url}/orders/SOL`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.orders.length).toBe(1)
    expect(body.orders[0].status).toBe('cancelled')
  })

  test('should return empty array when no orders for market', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/orders/ETH`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.orders).toEqual([])
  })
})

describe('GET /fills', () => {
  test('should return all fills', async () => {
    const aliceToken = await setupUser('alice', 5000)
    const bobToken = await setupUser('bob', 5000)

    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })

    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    const res = await fetch(`${url}/fills`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
    expect(body[0].market).toBe('SOL')
    expect(body[0].qty).toBe(10)
    expect(body[0].price).toBe(90)
  })

  test('should filter fills by market query param', async () => {
    const aliceToken = await setupUser('alice', 5000)
    const bobToken = await setupUser('bob', 5000)

    // SOL fill
    await placeOrder(url, aliceToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    // ETH fill
    await placeOrder(url, aliceToken, {
      market: 'ETH',
      type: 'SHORT',
      qty: 2,
      orderType: 'limit',
      price: 1900,
      margin: 2000,
    })
    await placeOrder(url, bobToken, {
      market: 'ETH',
      type: 'LONG',
      qty: 2,
      orderType: 'market',
      price: 0,
      margin: 2000,
    })

    const res = await fetch(`${url}/fills?market=SOL`)
    const body = await res.json()
    expect(body.length).toBe(1)
    expect(body[0].market).toBe('SOL')
  })

  test('should return empty array when no fills', async () => {
    const res = await fetch(`${url}/fills`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  test('should not require authentication', async () => {
    const res = await fetch(`${url}/fills`)
    expect(res.status).toBe(200)
  })
})
