import { describe, test, expect, beforeEach } from 'bun:test'
import request from 'supertest'
import { app } from '../index'
import { resetStore, getAuthToken } from '../test-utils'

describe('Onramp Route', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('POST /v1/onramp', () => {
    test('should add collateral to user account', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 })

      expect(res.status).toBe(200)
      expect(res.body.collateral.available).toBe(1000)
      expect(res.body.collateral.locked).toBe(0)
    })

    test('should accumulate collateral on multiple onramps', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500 })

      const res = await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 300 })

      expect(res.status).toBe(200)
      expect(res.body.collateral.available).toBe(800)
    })

    test('should return 400 if amount is missing', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Amount must be a positive number')
    })

    test('should return 400 if amount is negative', async () => {
      const token = await getAuthToken(app, 'alice', 'pass123')

      const res = await request(app)
        .post('/v1/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: -100 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Amount must be a positive number')
    })

    test('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/v1/onramp')
        .send({ amount: 1000 })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })

    test('should return 401 for invalid token', async () => {
      const res = await request(app)
        .post('/v1/onramp')
        .set('Authorization', 'Bearer invalidtoken123')
        .send({ amount: 1000 })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })
  })
})
