import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { startServer, stopServer, resetState, signUp, signIn, onramp } from './helpers'

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

describe('POST /signup', () => {
  test('should sign up a new user successfully', async () => {
    const { status, body } = await signUp(url, 'alice', 'pass123')
    expect(status).toBe(200)
    expect(body.userId).toBeDefined()
    expect(body.username).toBe('alice')
  })

  test('should return 400 when username is missing', async () => {
    const res = await fetch(`${url}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'pass123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('username and password are required')
  })

  test('should return 400 when password is missing', async () => {
    const res = await fetch(`${url}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('username and password are required')
  })

  test('should return 409 when username is already taken', async () => {
    await signUp(url, 'alice', 'pass123')
    const { status, body } = await signUp(url, 'alice', 'pass456')
    expect(status).toBe(409)
    expect(body.error).toBe('username is already taken')
  })

  test('should return different userIds for different users', async () => {
    const user1 = await signUp(url, 'alice', 'pass1')
    const user2 = await signUp(url, 'bob', 'pass2')
    expect(user1.body.userId).not.toBe(user2.body.userId)
  })
})

describe('POST /signin', () => {
  test('should sign in successfully with correct credentials', async () => {
    await signUp(url, 'alice', 'pass123')
    const { status, body } = await signIn(url, 'alice', 'pass123')
    expect(status).toBe(200)
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
  })

  test('should return 401 with wrong password', async () => {
    await signUp(url, 'alice', 'pass123')
    const { status, body } = await signIn(url, 'alice', 'wrongpass')
    expect(status).toBe(401)
    expect(body.error).toBe('invalid credentials')
  })

  test('should return 401 with non-existent username', async () => {
    const { status, body } = await signIn(url, 'nobody', 'pass123')
    expect(status).toBe(401)
    expect(body.error).toBe('invalid credentials')
  })

  test('should return different tokens for separate sign-ins', async () => {
    await signUp(url, 'alice', 'pass123')
    const res1 = await signIn(url, 'alice', 'pass123')
    const res2 = await signIn(url, 'alice', 'pass123')
    expect(res1.body.token).not.toBe(res2.body.token)
  })
})
