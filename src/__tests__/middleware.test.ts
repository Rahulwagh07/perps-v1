import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { startServer, stopServer, resetState, signUp, signIn, onramp, authHeaders, placeOrder } from './helpers'

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

describe('POST /onramp', () => {
  test('should add collateral to user account', async () => {
    await signUp(url, 'alice', 'pass123')
    const { body: signinBody } = await signIn(url, 'alice', 'pass123')
    const { status, body } = await onramp(url, signinBody.token, 1000)
    expect(status).toBe(200)
    expect(body.collateral.available).toBe(1000)
    expect(body.collateral.locked).toBe(0)
  })

  test('should accumulate collateral on multiple onramps', async () => {
    await signUp(url, 'alice', 'pass123')
    const { body: signinBody } = await signIn(url, 'alice', 'pass123')
    await onramp(url, signinBody.token, 500)
    const { status, body } = await onramp(url, signinBody.token, 300)
    expect(status).toBe(200)
    expect(body.collateral.available).toBe(800)
  })

  test('should return 400 with negative amount', async () => {
    await signUp(url, 'alice', 'pass123')
    const { body: signinBody } = await signIn(url, 'alice', 'pass123')
    const { status, body } = await onramp(url, signinBody.token, -100)
    expect(status).toBe(400)
    expect(body.error).toBe('Amount must be a positive number')
  })

  test('should return 400 with zero amount', async () => {
    await signUp(url, 'alice', 'pass123')
    const { body: signinBody } = await signIn(url, 'alice', 'pass123')
    const { status, body } = await onramp(url, signinBody.token, 0)
    expect(status).toBe(400)
    expect(body.error).toBe('Amount must be a positive number')
  })

  test('should return 401 without auth token', async () => {
    const res = await fetch(`${url}/onramp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100 }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  test('should return 401 with invalid token', async () => {
    const res = await fetch(`${url}/onramp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalidtoken123',
      },
      body: JSON.stringify({ amount: 100 }),
    })
    expect(res.status).toBe(401)
  })
})

describe('Authentication middleware', () => {
  test('should return 401 for protected order endpoint without token', async () => {
    const res = await fetch(`${url}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  test('should return 401 for protected equity endpoint without token', async () => {
    const res = await fetch(`${url}/equity/available`)
    expect(res.status).toBe(401)
  })

  test('should return 401 for protected positions endpoint without token', async () => {
    const res = await fetch(`${url}/positions/open/SOL`)
    expect(res.status).toBe(401)
  })

  test('should return 401 for protected orders endpoint without token', async () => {
    const res = await fetch(`${url}/orders/open/SOL`)
    expect(res.status).toBe(401)
  })

  test('should return 401 for delete order endpoint without token', async () => {
    const res = await fetch(`${url}/order`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 1 }),
    })
    expect(res.status).toBe(401)
  })
})
