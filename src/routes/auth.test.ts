import { describe, test, expect, beforeEach } from 'bun:test'
import request from 'supertest'
import { app } from '../index'
import { resetStore, getAuthToken } from '../test-utils'

describe('Auth Routes', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('POST /v1/signup', () => {
    test('should create a new user successfully', async () => {
      const res = await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass123' })

      expect(res.status).toBe(200)
      expect(res.body.userId).toBe(1)
      expect(res.body.username).toBe('alice')
    })

    test('should return 400 if username is missing', async () => {
      const res = await request(app)
        .post('/v1/signup')
        .send({ password: 'pass123' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('username and password are required')
    })

    test('should return 400 if password is missing', async () => {
      const res = await request(app)
        .post('/v1/signup')
        .send({ username: 'alice' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('username and password are required')
    })

    test('should return 400 if both fields are missing', async () => {
      const res = await request(app)
        .post('/v1/signup')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('username and password are required')
    })

    test('should return 409 if username is already taken', async () => {
      await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res = await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass456' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('username is already taken')
    })

    test('should allow multiple users with different usernames', async () => {
      const res1 = await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res2 = await request(app)
        .post('/v1/signup')
        .send({ username: 'bob', password: 'pass456' })

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
      expect(res1.body.userId).toBe(1)
      expect(res2.body.userId).toBe(2)
    })
  })

  describe('POST /v1/signin', () => {
    test('should sign in successfully and return a token', async () => {
      await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res = await request(app)
        .post('/v1/signin')
        .send({ username: 'alice', password: 'pass123' })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(typeof res.body.token).toBe('string')
    })

    test('should return 401 for invalid credentials', async () => {
      await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res = await request(app)
        .post('/v1/signin')
        .send({ username: 'alice', password: 'wrongpass' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('invalid credentials')
    })

    test('should return 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/v1/signin')
        .send({ username: 'nonexistent', password: 'pass123' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('invalid credentials')
    })

    test('should return different tokens for different sign-ins', async () => {
      await request(app)
        .post('/v1/signup')
        .send({ username: 'alice', password: 'pass123' })

      const res1 = await request(app)
        .post('/v1/signin')
        .send({ username: 'alice', password: 'pass123' })

      const res2 = await request(app)
        .post('/v1/signin')
        .send({ username: 'alice', password: 'pass123' })

      expect(res1.body.token).not.toBe(res2.body.token)
    })
  })
})
