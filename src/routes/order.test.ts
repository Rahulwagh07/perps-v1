import { describe, it, expect, beforeEach } from 'bun:test'
import express from 'express'
import request from 'supertest'
import orderRouter from './order'
import { users, sessions, orderbooks, fills } from '../store'
import type { User } from '../types'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(orderRouter)
  return app
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 999,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 10000, locked: 0 },
    positions: [],
    orders: [],
    ...overrides,
  }
}

describe('Order Routes', () => {
  beforeEach(() => {
    users.length = 0
    fills.length = 0
    Object.keys(sessions).forEach(k => delete sessions[k])
    // Reset orderbooks
    orderbooks['SOL'] = { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01 }
    orderbooks['ETH'] = { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 }
  })

  describe('POST /order', () => {
    it('should place a limit order', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .post('/order')
        .set('Authorization', 'Bearer test-token')
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'limit',
          price: 88,
          margin: 440,
        })

      expect(res.status).toBe(201)
      expect(typeof res.body.orderId).toBe('number')
      expect(res.body.price).toBe(88)
    })

    it('should place a market order', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .post('/order')
        .set('Authorization', 'Bearer test-token')
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      expect(res.status).toBe(201)
      expect(res.body.price).toBe(90) // lastTradedPrice
    })

    it('should return 400 for missing fields', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .post('/order')
        .set('Authorization', 'Bearer test-token')
        .send({ market: 'SOL' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it('should return 400 for invalid type', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .post('/order')
        .set('Authorization', 'Bearer test-token')
        .send({
          market: 'SOL',
          type: 'INVALID',
          qty: 5,
          orderType: 'limit',
          price: 88,
          margin: 440,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('LONG or SHORT')
    })

    it('should return 400 for invalid orderType', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .post('/order')
        .set('Authorization', 'Bearer test-token')
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'stop',
          price: 88,
          margin: 440,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('limit or market')
    })

    it('should return 400 for insufficient balance', async () => {
      const user = makeUser({ userId: 1, collateral: { available: 10, locked: 0 } })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .post('/order')
        .set('Authorization', 'Bearer test-token')
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'limit',
          price: 88,
          margin: 440,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('insufficient balance')
    })

    it('should return 401 without auth', async () => {
      const res = await request(createApp())
        .post('/order')
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'limit',
          price: 88,
          margin: 440,
        })

      expect(res.status).toBe(401)
    })
  })

  describe('DELETE /order', () => {
    it('should cancel an open order', async () => {
      const user = makeUser({
        userId: 1,
        collateral: { available: 9560, locked: 440 },
        orders: [
          { orderId: 1, market: 'SOL', type: 'LONG', qty: 5, filledQty: 0, margin: 440, orderType: 'limit', price: 88, status: 'open', createdAt: new Date() },
        ],
      })
      users.push(user)
      sessions['test-token'] = 1

      // Add the order to orderbook
      orderbooks['SOL'].bids['88'] = {
        availableQty: 5,
        openOrders: [{ userId: 1, qty: 5, filledQty: 0, orderId: 1, createdAt: new Date() }],
      }

      const res = await request(createApp())
        .delete('/order')
        .set('Authorization', 'Bearer test-token')
        .send({ orderId: 1 })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('order cancelled')
      expect(res.body.marginToReturned).toBe(440)
    })

    it('should return 400 for missing orderId', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .delete('/order')
        .set('Authorization', 'Bearer test-token')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Orderid is required')
    })

    it('should return 400 for non-existent order', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .delete('/order')
        .set('Authorization', 'Bearer test-token')
        .send({ orderId: 999 })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Order not found')
    })

    it('should return 400 for already filled order', async () => {
      const user = makeUser({
        userId: 1,
        orders: [
          { orderId: 1, market: 'SOL', type: 'LONG', qty: 5, filledQty: 5, margin: 440, orderType: 'limit', price: 88, status: 'filled', createdAt: new Date() },
        ],
      })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .delete('/order')
        .set('Authorization', 'Bearer test-token')
        .send({ orderId: 1 })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Can not cancel')
    })

    it('should return 401 without auth', async () => {
      const res = await request(createApp())
        .delete('/order')
        .send({ orderId: 1 })

      expect(res.status).toBe(401)
    })
  })
})
