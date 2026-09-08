import { describe, it, expect, beforeEach } from 'bun:test'
import express from 'express'
import request from 'supertest'
import authRouter from './auth'
import { users, sessions } from '../store'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(authRouter)
  return app
}

describe('Auth Routes', () => {
  beforeEach(() => {
    users.length = 0
    Object.keys(sessions).forEach(k => delete sessions[k])
  })

  describe('POST /signup', () => {
    it('should sign up a new user', async () => {
      const res = await request(createApp())
        .post('/signup')
        .send({ username: 'alice', password: 'pass123' })

      expect(res.status).toBe(200)
      expect(res.body.username).toBe('alice')
      expect(typeof res.body.userId).toBe('number')
    })

    it('should return 400 if username or password missing', async () => {
      const res = await request(createApp())
        .post('/signup')
        .send({ username: 'alice' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it('should return 409 if username already taken', async () => {
      await request(createApp())
        .post('/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res = await request(createApp())
        .post('/signup')
        .send({ username: 'alice', password: 'pass456' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBeDefined()
    })
  })

  describe('POST /signin', () => {
    it('should sign in and return a token', async () => {
      await request(createApp())
        .post('/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res = await request(createApp())
        .post('/signin')
        .send({ username: 'alice', password: 'pass123' })

      expect(res.status).toBe(200)
      expect(typeof res.body.token).toBe('string')
    })

    it('should return 401 for invalid credentials', async () => {
      const res = await request(createApp())
        .post('/signin')
        .send({ username: 'alice', password: 'wrong' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBeDefined()
    })
  })

  describe('POST /onramp-usdc', () => {
    it('should add collateral to authenticated user', async () => {
      const app = createApp()

      await request(app)
        .post('/signup')
        .send({ username: 'alice', password: 'pass123' })

      const signinRes = await request(app)
        .post('/signin')
        .send({ username: 'alice', password: 'pass123' })

      const token = signinRes.body.token

      const res = await request(app)
        .post('/onramp-usdc')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 })

      expect(res.status).toBe(200)
      expect(res.body.collateral.available).toBe(1000)
    })

    it('should return 401 without auth token', async () => {
      const res = await request(createApp())
        .post('/onramp-usdc')
        .send({ amount: 1000 })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })

    it('should return 400 for invalid amount', async () => {
      const app = createApp()

      await request(app)
        .post('/signup')
        .send({ username: 'alice', password: 'pass123' })

      const signinRes = await request(app)
        .post('/signin')
        .send({ username: 'alice', password: 'pass123' })

      const token = signinRes.body.token

      const res = await request(app)
        .post('/onramp-usdc')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: -100 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })
  })
})
