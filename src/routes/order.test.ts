import { describe, test, expect, beforeEach } from 'bun:test'
import request from 'supertest'
import { app } from '../index'
import { resetStore, getAuthToken } from '../test-utils'

describe('Order Routes', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('POST /v1/order', () => {
    test('should place a limit order successfully', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const res = await request(app)
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

      expect(res.status).toBe(201)
      expect(res.body.orderId).toBeDefined()
      expect(res.body.status).toBe('open')
      expect(res.body.filledQty).toBe(0)
      expect(res.body.price).toBe(95)
    })

    test('should place a market order successfully', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const res = await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          price: 90,
          margin: 450,
        })

      expect(res.status).toBe(201)
      expect(res.body.orderId).toBeDefined()
    })

    test('should return 400 for missing required fields', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({ market: 'SOL' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Missing required fields')
    })

    test('should return 400 for invalid type', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const res = await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'INVALID',
          qty: 10,
          orderType: 'limit',
          price: 95,
          margin: 500,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('type must be LONG or SHORT')
    })

    test('should return 400 for invalid orderType', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const res = await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          orderType: 'stop',
          price: 95,
          margin: 500,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('orderType must be limit or market')
    })

    test('should return 400 for insufficient balance', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
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

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('insufficient balance')
    })

    test('should return 400 for limit order without price', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const res = await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          orderType: 'limit',
          margin: 500,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('price is req for limit orders')
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/v1/order')
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          orderType: 'limit',
          price: 95,
          margin: 500,
        })

      expect(res.status).toBe(401)
    })

    test('should lock margin when placing an order', async () => {
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

      const equityRes = await request(app)
        .get('/v1/equity/available')
        .set('Authorization', `Bearer ${token}`)

      expect(equityRes.status).toBe(200)
      expect(equityRes.body.totalEquity).toBe(10000)
    })

    test('should fill a market order when opposite side has resting orders', async () => {
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

      // Alice places a limit sell order at 90
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

      // Bob places a market buy order
      const res = await request(app)
        .post('/v1/order')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          market: 'SOL',
          type: 'LONG',
          qty: 5,
          orderType: 'market',
          margin: 450,
        })

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('filled')
      expect(res.body.filledQty).toBe(5)
    })
  })

  describe('DELETE /v1/order', () => {
    test('should cancel an open order', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const orderRes = await request(app)
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

      const orderId = orderRes.body.orderId

      const res = await request(app)
        .delete('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('order cancelled')
      expect(res.body.marginToReturned).toBe(500)
    })

    test('should return 400 if orderId is missing', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .delete('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Orderid is required')
    })

    test('should return 400 if order does not exist', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .delete('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 9999 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Order not found')
    })

    test('should return 400 when trying to cancel a filled order', async () => {
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
      const orderRes = await request(app)
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

      // Bob fills it with a market buy
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

      // Alice tries to cancel the filled order
      const res = await request(app)
        .delete('/v1/order')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ orderId: orderRes.body.orderId })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/Can not cancel/)
    })

    test('should return collateral after cancelling an order', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 })

      const orderRes = await request(app)
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
        .delete('/v1/order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: orderRes.body.orderId })

      const equityRes = await request(app)
        .get('/v1/equity/available')
        .set('Authorization', `Bearer ${token}`)

      expect(equityRes.status).toBe(200)
      expect(equityRes.body.totalEquity).toBe(10000)
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .delete('/v1/order')
        .send({ orderId: 1 })

      expect(res.status).toBe(401)
    })
  })
})
