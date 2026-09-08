import { describe, test, expect, beforeEach } from 'bun:test'
import request from 'supertest'
import { app } from '../index'
import { resetStore, getAuthToken } from '../test-utils'

describe('Account Routes', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('GET /v1/equity/available', () => {
    test('should return total equity for user', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 5000 })

      const res = await request(app)
        .get('/v1/equity/available')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.totalEquity).toBe(5000)
    })

    test('should return 0 equity for user with no collateral', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .get('/v1/equity/available')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.totalEquity).toBe(0)
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get('/v1/equity/available')

      expect(res.status).toBe(401)
    })

    test('should reflect locked margin in equity calculation', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          orderType: 'limit',
          price: 95,
          margin: 2000,
        })

      const res = await request(app)
        .get('/v1/equity/available')
        .set('Authorization', `Bearer ${token}`)

      // equity = available (8000) + locked (2000) = 10000
      expect(res.status).toBe(200)
      expect(res.body.totalEquity).toBe(10000)
    })
  })

  describe('GET /v1/positions/open/:marketId', () => {
    test('should return open positions for a market', async () => {
      const aliceToken = await getAuthToken(app, 'alice', 'pass123')
      const bobToken = await getAuthToken(app, 'bob', 'pass456')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ amount: 10000 })

      // Alice places a limit sell at 90
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          market: 'SOL',
          type: 'SHORT',
          qty: 5,
          orderType: 'limit',
          price: 90,
          margin: 450,
        })

      // Bob buys with market order, creating a position for both
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      const res = await request(app)
        .get('/v1/positions/open/SOL')
        .set('Authorization', `Bearer ${aliceToken}`)

      expect(res.status).toBe(200)
      expect(res.body.positions).toBeArray()
      expect(res.body.positions.length).toBe(1)
      expect(res.body.positions[0].market).toBe('SOL')
      expect(res.body.positions[0].status).not.toBe('closed')
    })

    test('should return empty positions for market with no activity', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .get('/v1/positions/open/ETH')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.positions).toEqual([])
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get('/v1/positions/open/SOL')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/positions/closed/:marketId', () => {
    test('should return closed positions for a market', async () => {
      const aliceToken = await getAuthToken(app, 'alice', 'pass123')
      const bobToken = await getAuthToken(app, 'bob', 'pass456')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ amount: 10000 })

      // Step 1: Alice places a SHORT limit sell at 90
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          market: 'SOL',
          type: 'SHORT',
          qty: 5,
          orderType: 'limit',
          price: 90,
          margin: 450,
        })

      // Step 2: Bob fills it with a market buy (Alice now has SHORT position)
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      // Step 3: Bob places a SHORT limit sell at 90 (so Alice can buy to close)
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'SHORT',
          qty: 5,
          orderType: 'limit',
          price: 90,
          margin: 450,
        })

      // Step 4: Alice places a market buy to close her SHORT position
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      const res = await request(app)
        .get('/v1/positions/closed/SOL')
        .set('Authorization', `Bearer ${aliceToken}`)

      expect(res.status).toBe(200)
      expect(res.body.positions).toBeArray()
      expect(res.body.positions.length).toBe(1)
      expect(res.body.positions[0].status).toBe('closed')
    })

    test('should return empty array when no closed positions', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .get('/v1/positions/closed/SOL')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.positions).toEqual([])
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get('/v1/positions/closed/SOL')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/orders/open/:marketId', () => {
    test('should return open orders for a market', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          orderType: 'limit',
          price: 95,
          margin: 500,
        })

      const res = await request(app)
        .get('/v1/orders/open/SOL')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.openOrders).toBeArray()
      expect(res.body.openOrders.length).toBe(1)
      expect(res.body.openOrders[0].status).toBe('open')
    })

    test('should return empty array when no open orders', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .get('/v1/orders/open/SOL')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.openOrders).toEqual([])
    })

    test('should not include filled orders', async () => {
      const aliceToken = await getAuthToken(app, 'alice', 'pass123')
      const bobToken = await getAuthToken(app, 'bob', 'pass456')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ amount: 10000 })

      // Alice places a sell order
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          market: 'SOL',
          type: 'SHORT',
          qty: 5,
          orderType: 'limit',
          price: 90,
          margin: 450,
        })

      // Bob fills it
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      const res = await request(app)
        .get('/v1/orders/open/SOL')
        .set('Authorization', `Bearer ${aliceToken}`)

      expect(res.status).toBe(200)
      expect(res.body.openOrders.length).toBe(0)
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get('/v1/orders/open/SOL')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/orders/:marketId', () => {
    test('should return all orders for a market', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          orderType: 'limit',
          price: 95,
          margin: 500,
        })

      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'limit',
          price: 96,
          margin: 250,
        })

      const res = await request(app)
        .get('/v1/orders/SOL')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.orders).toBeArray()
      expect(res.body.orders.length).toBe(2)
    })

    test('should return empty array when no orders for market', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .get('/v1/orders/SOL')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.orders).toEqual([])
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get('/v1/orders/SOL')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/fills', () => {
    test('should return all fills', async () => {
      const aliceToken = await getAuthToken(app, 'alice', 'pass123')
      const bobToken = await getAuthToken(app, 'bob', 'pass456')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ amount: 10000 })

      // Create a fill by matching orders
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          market: 'SOL',
          type: 'SHORT',
          qty: 5,
          orderType: 'limit',
          price: 90,
          margin: 450,
        })

      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      const res = await request(app)
        .get('/v1/fills')

      expect(res.status).toBe(200)
      expect(res.body).toBeArray()
      expect(res.body.length).toBe(1)
      expect(res.body[0].market).toBe('SOL')
      expect(res.body[0].qty).toBe(5)
      expect(res.body[0].price).toBe(90)
    })

    test('should filter fills by market query param', async () => {
      const aliceToken = await getAuthToken(app, 'alice', 'pass123')
      const bobToken = await getAuthToken(app, 'bob', 'pass456')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ amount: 10000 })

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ amount: 10000 })

      // Create a fill on SOL
      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          market: 'SOL',
          type: 'SHORT',
          qty: 5,
          orderType: 'limit',
          price: 90,
          margin: 450,
        })

      await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      const res = await request(app)
        .get('/v1/fills?market=SOL')

      expect(res.status).toBe(200)
      expect(res.body).toBeArray()
      expect(res.body.length).toBe(1)
      expect(res.body[0].market).toBe('SOL')

      const ethRes = await request(app)
        .get('/v1/fills?market=ETH')

      expect(ethRes.status).toBe(200)
      expect(ethRes.body).toEqual([])
    })

    test('should return empty array when no fills exist', async () => {
      const res = await request(app)
        .get('/v1/fills')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })
})
