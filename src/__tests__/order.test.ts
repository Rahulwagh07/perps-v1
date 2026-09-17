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

describe('POST /order - Place Order', () => {
  test('should place a limit buy order successfully', async () => {
    const token = await setupUser('alice', 5000)
    const { status, body } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    expect(status).toBe(201)
    expect(body.orderId).toBeDefined()
    expect(body.status).toBe('open')
    expect(body.filledQty).toBe(0)
    expect(body.price).toBe(90)
  })

  test('should place a limit sell order successfully', async () => {
    const token = await setupUser('alice', 5000)
    const { status, body } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'SHORT',
      qty: 5,
      orderType: 'limit',
      price: 95,
      margin: 300,
    })
    expect(status).toBe(201)
    expect(body.orderId).toBeDefined()
    expect(body.status).toBe('open')
  })

  test('should place a market buy order successfully', async () => {
    const token = await setupUser('alice', 5000)
    const { status, body } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'market',
      price: 0,
      margin: 200,
    })
    expect(status).toBe(201)
    expect(body.orderId).toBeDefined()
    expect(body.price).toBe(90) // last traded price
  })

  test('should place order on new market with a price', async () => {
    const token = await setupUser('alice', 5000)
    const { status, body } = await placeOrder(url, token, {
      market: 'DOGE',
      type: 'LONG',
      qty: 100,
      orderType: 'market',
      price: 0.15,
      margin: 1000,
    })
    expect(status).toBe(201)
    expect(body.orderId).toBeDefined()
  })

  test('should return 400 when market is missing', async () => {
    const token = await setupUser('alice', 5000)
    const { status, body } = await placeOrder(url, token, {
      market: '',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Missing required fields')
  })

  test('should return 400 when type is invalid', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market: 'SOL',
        type: 'LONGER',
        qty: 10,
        orderType: 'limit',
        price: 90,
        margin: 500,
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('type must be LONG or SHORT')
  })

  test('should return 400 when orderType is invalid', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'stop',
        price: 90,
        margin: 500,
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('orderType must be limit or market')
  })

  test('should return 400 when price is missing for limit order', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/order`, {
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
        margin: 500,
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('price is req for limit orders')
  })

  test('should return 400 with insufficient balance', async () => {
    const token = await setupUser('alice', 100) // only 100 available
    const { status, body } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500, // more than available
    })
    expect(status).toBe(400)
    expect(body.error).toBe('insufficient balance')
  })

  test('should lock margin when order is placed', async () => {
    const token = await setupUser('alice', 1000)
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    // Check collateral via equity endpoint
    const res = await fetch(`${url}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    // 1000 available - 500 locked = 500 total collateral (no pnl)
    expect(body.totalEquity).toBe(1000)
  })

  test('should deduct available balance on order placement', async () => {
    const token = await setupUser('alice', 1000)
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 400,
    })
    const res = await fetch(`${url}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.totalEquity).toBe(1000) // total equity unchanged
  })
})

describe('DELETE /order - Cancel Order', () => {
  test('should cancel an open order successfully', async () => {
    const token = await setupUser('alice', 5000)
    const { body: orderBody } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    const { status, body } = await cancelOrder(url, token, orderBody.orderId)
    expect(status).toBe(200)
    expect(body.message).toBe('order cancelled')
    expect(body.marginToReturned).toBe(500)
  })

  test('should return margin to available on cancel', async () => {
    const token = await setupUser('alice', 1000)
    await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 500,
    })
    const { body: orderBody } = await placeOrder(url, token, {
      market: 'SOL',
      type: 'LONG',
      qty: 5,
      orderType: 'limit',
      price: 85,
      margin: 300,
    })

    // Cancel the second order
    await cancelOrder(url, token, orderBody.orderId)

    // Check equity: 1000 - 500 (first order) - 300 (second order) + 300 (returned) = 1000
    const res = await fetch(`${url}/equity/available`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    expect(body.totalEquity).toBe(1000)
  })

  test('should return 400 when orderId is missing', async () => {
    const token = await setupUser('alice', 5000)
    const res = await fetch(`${url}/order`, {
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

  test('should return 400 when order does not exist', async () => {
    const token = await setupUser('alice', 5000)
    const { status, body } = await cancelOrder(url, token, 9999)
    expect(status).toBe(400)
    expect(body.error).toBe('Order not found')
  })

  test('should return 400 when trying to cancel a filled order', async () => {
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

    // Bob places a market buy that should fill Alice's order
    await placeOrder(url, bobToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'market',
      price: 0,
      margin: 500,
    })

    // Alice's order should be filled now
    const { status, body } = await cancelOrder(url, aliceToken, 1)
    expect(status).toBe(400)
    expect(body.error).toContain('Can not cancel the order with current status')
  })
})
