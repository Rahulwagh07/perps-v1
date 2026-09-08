import request from 'supertest'
import type { Express } from 'express'
import { resetStore } from './store'

export { resetStore }

export async function signupUser(
  app: Express,
  username: string,
  password: string
) {
  const res = await request(app).post('/v1/signup').send({ username, password })
  return res
}

export async function signinUser(
  app: Express,
  username: string,
  password: string
) {
  const res = await request(app).post('/v1/signin').send({ username, password })
  return res
}

export async function getAuthToken(
  app: Express,
  username: string,
  password: string
): Promise<string> {
  await signupUser(app, username, password)
  const res = await signinUser(app, username, password)
  return res.body.token
}
