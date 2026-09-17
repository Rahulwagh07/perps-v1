import app from '../app'
import type { Server } from 'http'
import { resetStore } from '../store'

let server: Server
let baseUrl: string

export async function startServer(): Promise<string> {
  return new Promise(resolve => {
    server = app.listen(0, () => {
      const addr = server.address()
      if (typeof addr === 'object' && addr) {
        baseUrl = `http://localhost:${addr.port}`
        resolve(baseUrl)
      }
    })
  })
}

export function stopServer() {
  return new Promise<void>(resolve => {
    if (server) server.close(() => resolve())
    else resolve()
  })
}

export function resetState() {
  resetStore()
}

export async function signUp(
  url: string,
  username: string,
  password: string
) {
  const res = await fetch(`${url}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return { status: res.status, body: await res.json() }
}

export async function signIn(
  url: string,
  username: string,
  password: string
) {
  const res = await fetch(`${url}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return { status: res.status, body: await res.json() }
}

export async function onramp(
  url: string,
  token: string,
  amount: number
) {
  const res = await fetch(`${url}/onramp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  })
  return { status: res.status, body: await res.json() }
}

export function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export async function placeOrder(
  url: string,
  token: string,
  body: {
    market: string
    type: string
    qty: number
    orderType: string
    price: number
    margin: number
  }
) {
  const res = await fetch(`${url}/order`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

export async function cancelOrder(
  url: string,
  token: string,
  orderId: number
) {
  const res = await fetch(`${url}/order`, {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ orderId }),
  })
  return { status: res.status, body: await res.json() }
}
