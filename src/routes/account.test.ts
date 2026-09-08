import { describe, it, expect, beforeEach } from 'bun:test'
import express from 'express'
import request from 'supertest'
import accountRouter from './account'
import { users, sessions, orderbooks, fills } from '../store'
import type { User } from '../types'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(accountRouter)
  return app
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 999,
    username: 'testuser',
    password: 'pass',
    collateral: { available: 1000, locked: 0 },
    positions: [],
    orders: [],
    ...overrides,
  }
}

describe('Account Routes', () => {
  beforeEach(() => {
    users.length = 0
    fills.length = 0
    Object.keys(sessions).forEach(k => delete sessions[k])
  })

  describe('GET /equity/available', () => {
    it('should return equity for authenticated user', async () => {
      const user = makeUser({ userId: 1 })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .get('/equity/available')
        .set('Authorization', 'Bearer test-token')

      expect(res.status).toBe(200)
      expect(typeof res.body.totalEquity).toBe('number')
      expect(res.body.totalEquity).toBe(1000)
    })

    it('should return 401 without auth', async () => {
      const res = await request(createApp())
        .get('/equity/available')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /positions/open/:marketId', () => {
    it('should return open positions for market', async () => {
      const user = makeUser({
        userId: 1,
        positions: [
          { market: 'SOL', type: 'LONG', qty: 10, margin: 100, liquidationPrice: 80, averagePrice: 90, status: 'open' },
          { market: 'SOL', type: 'SHORT', qty: 5, margin: 50, liquidationPrice: 100, averagePrice: 90, status: 'closed' },
          { market: 'ETH', type: 'LONG', qty: 2, margin: 200, liquidationPrice: 1800, averagePrice: 1900, status: 'open' },
        ],
      })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .get('/positions/open/SOL')
        .set('Authorization', 'Bearer test-token')

      expect(res.status).toBe(200)
      expect(res.body.positions).toHaveLength(1)
      expect(res.body.positions[0].status).toBe('open')
    })

    it('should return 401 without auth', async () => {
      const res = await request(createApp())
        .get('/positions/open/SOL')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /positions/closed/:marketId', () => {
    it('should return closed positions for market', async () => {
      const user = makeUser({
        userId: 1,
        positions: [
          { market: 'SOL', type: 'LONG', qty: 10, margin: 100, liquidationPrice: 80, averagePrice: 90, status: 'open' },
          { market: 'SOL', type: 'SHORT', qty: 5, margin: 50, liquidationPrice: 100, averagePrice: 90, status: 'closed' },
        ],
      })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .get('/positions/closed/SOL')
        .set('Authorization', 'Bearer test-token')

      expect(res.status).toBe(200)
      expect(res.body.positions).toHaveLength(1)
      expect(res.body.positions[0].status).toBe('closed')
    })
  })

  describe('GET /orders/open/:marketId', () => {
    it('should return open and partial orders for market', async () => {
      const user = makeUser({
        userId: 1,
        orders: [
          { orderId: 1, market: 'SOL', type: 'LONG', qty: 10, filledQty: 0, margin: 100, orderType: 'limit', price: 90, status: 'open', createdAt: new Date() },
          { orderId: 2, market: 'SOL', type: 'SHORT', qty: 5, filledQty: 2, margin: 50, orderType: 'limit', price: 95, status: 'partial', createdAt: new Date() },
          { orderId: 3, market: 'SOL', type: 'LONG', qty: 3, filledQty: 3, margin: 30, orderType: 'limit', price: 88, status: 'filled', createdAt: new Date() },
        ],
      })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .get('/orders/open/SOL')
        .set('Authorization', 'Bearer test-token')

      expect(res.status).toBe(200)
      expect(res.body.openOrders).toHaveLength(2)
    })
  })

  describe('GET /orders/:marketId', () => {
    it('should return all orders for market', async () => {
      const user = makeUser({
        userId: 1,
        orders: [
          { orderId: 1, market: 'SOL', type: 'LONG', qty: 10, filledQty: 0, margin: 100, orderType: 'limit', price: 90, status: 'open', createdAt: new Date() },
          { orderId: 2, market: 'ETH', type: 'SHORT', qty: 5, filledQty: 0, margin: 50, orderType: 'limit', price: 1900, status: 'open', createdAt: new Date() },
        ],
      })
      users.push(user)
      sessions['test-token'] = 1

      const res = await request(createApp())
        .get('/orders/SOL')
        .set('Authorization', 'Bearer test-token')

      expect(res.status).toBe(200)
      expect(res.body.orders).toHaveLength(1)
      expect(res.body.orders[0].market).toBe('SOL')
    })
  })

  describe('GET /fills', () => {
    it('should return all fills without query', async () => {
      fills.push({
        fillId: 1, maker: 1, taker: 2, market: 'SOL', qty: 5, price: 90, long: 1, short: 2, createdAt: new Date(),
      })

      const res = await request(createApp()).get('/fills')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })

    it('should filter fills by market query', async () => {
      fills.push(
        { fillId: 1, maker: 1, taker: 2, market: 'SOL', qty: 5, price: 90, long: 1, short: 2, createdAt: new Date() },
        { fillId: 2, maker: 3, taker: 4, market: 'ETH', qty: 2, price: 1900, long: 3, short: 4, createdAt: new Date() },
      )

      const res = await request(createApp()).get('/fills?market=SOL')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].market).toBe('SOL')
    })
  })
})
