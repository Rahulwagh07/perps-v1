import { bench, group, run } from 'mitata'
import app from './app'
import { resetStore, users, orderbooks, fills } from './store'

const BASE = 'http://localhost:3499'

// ─── Start server before benchmarks ──────────────────────────────────────────

const server = app.listen(3499)

process.on('exit', () => {
  server?.close()
})

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function http(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function signup(username: string, password = 'pass') {
  const res = await http('POST', '/signup', { username, password })
  return res.json() as Promise<{ userId: number; username: string }>
}

async function signin(username: string, password = 'pass') {
  const res = await http('POST', '/signin', { username, password })
  return res.json() as Promise<{ token: string }>
}

async function onboard(token: string, amount = 100_000) {
  const res = await http('POST', '/onramp', { amount }, token)
  return res.json() as Promise<any>
}

async function placeOrder(
  token: string,
  opts: { market: string; type: string; qty: number; orderType: string; price: number; margin: number }
) {
  return http('POST', '/order', opts, token)
}

async function cancelOrder(token: string, orderId: number) {
  return http('DELETE', '/order', { orderId }, token)
}

// ─── Benchmark: Auth endpoints ───────────────────────────────────────────────

group('http – POST /signup (sequential)', () => {
  let counter = 0
  bench('signup new user', async () => {
    counter++
    await http('POST', '/signup', { username: `bench_${counter}_${Math.random()}`, password: 'pass' })
  })
})

group('http – POST /signin (sequential)', () => {
  let prepared = false
  async function prepare() {
    if (!prepared) {
      await http('POST', '/signup', { username: 'signin_bench', password: 'pass' })
      prepared = true
    }
  }

  bench('signin existing user', async () => {
    await prepare()
    await http('POST', '/signin', { username: 'signin_bench', password: 'pass' })
  })
})

group('http – POST /onramp (sequential)', () => {
  let prepared = false
  let token = ''
  async function prepare() {
    if (!prepared) {
      await http('POST', '/signup', { username: 'onramp_bench', password: 'pass' })
      const res = await http('POST', '/signin', { username: 'onramp_bench', password: 'pass' })
      const body = await res.json() as any
      token = body.token
      prepared = true
    }
  }

  bench('onramp collateral', async () => {
    await prepare()
    await http('POST', '/onramp', { amount: 1_000 }, token)
  })
})

// ─── Benchmark: Order placement (unmatched) ──────────────────────────────────

group('http – POST /order (limit, no match – 1000 iterations)', () => {
  const tokens: string[] = []
  let prepared = false

  async function prepare() {
    if (prepared) return
    for (let i = 0; i < 200; i++) {
      await http('POST', '/signup', { username: `order_bench_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `order_bench_${i}`, password: 'pass' })
      const body = await res.json() as any
      tokens.push(body.token)
      await http('POST', '/onramp', { amount: 1_000_000 }, body.token)
    }
    prepared = true
  }

  let i = 0
  bench('place unmatched limit order', async () => {
    await prepare()
    const idx = i++ % tokens.length
    const price = 80 + (i % 20)
    await placeOrder(tokens[idx], {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price,
      margin: 1_000,
    })
  })
})

// ─── Benchmark: Order placement (with match) ────────────────────────────────

group('http – POST /order (limit, instant match – 1000 iterations)', () => {
  const makerTokens: string[] = []
  const takerTokens: string[] = []
  let prepared = false

  async function prepare() {
    if (prepared) return

    // Create 100 makers (each places 1 resting sell)
    for (let i = 0; i < 100; i++) {
      await http('POST', '/signup', { username: `maker_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `maker_${i}`, password: 'pass' })
      const body = await res.json() as any
      makerTokens.push(body.token)
      await http('POST', '/onramp', { amount: 1_000_000 }, body.token)
      await placeOrder(body.token, {
        market: 'SOL',
        type: 'SHORT',
        qty: 10,
        orderType: 'limit',
        price: 100,
        margin: 1_000,
      })
    }

    // Create 100 takers
    for (let i = 0; i < 100; i++) {
      await http('POST', '/signup', { username: `taker_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `taker_${i}`, password: 'pass' })
      const body = await res.json() as any
      takerTokens.push(body.token)
      await http('POST', '/onramp', { amount: 1_000_000 }, body.token)
    }

    prepared = true
  }

  let i = 0
  bench('place order that instantly matches', async () => {
    await prepare()
    const idx = i++ % takerTokens.length
    await placeOrder(takerTokens[idx], {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 100,
      margin: 1_000,
    })
  })
})

// ─── Benchmark: Order cancellation ───────────────────────────────────────────

group('http – DELETE /order (sequential)', () => {
  let prepared = false
  let token = ''
  let orderIds: number[] = []

  async function prepare() {
    if (prepared) return
    await http('POST', '/signup', { username: 'cancel_bench', password: 'pass' })
    const res = await http('POST', '/signin', { username: 'cancel_bench', password: 'pass' })
    const body = await res.json() as any
    token = body.token
    await http('POST', '/onramp', { amount: 10_000_000 }, token)

    // Place 500 orders to cancel
    for (let i = 0; i < 500; i++) {
      const orderRes = await placeOrder(token, {
        market: 'SOL',
        type: 'LONG',
        qty: 1,
        orderType: 'limit',
        price: 70 + (i % 5),
        margin: 100,
      })
      const orderBody = await orderRes.json() as any
      if (orderBody.orderId) orderIds.push(orderBody.orderId)
    }
    prepared = true
  }

  let i = 0
  bench('cancel existing order', async () => {
    await prepare()
    if (i < orderIds.length) {
      await cancelOrder(token, orderIds[i++])
    }
  })
})

// ─── Benchmark: Read endpoints (cold) ────────────────────────────────────────

group('http – GET /equity/available (sequential)', () => {
  let prepared = false
  let token = ''

  async function prepare() {
    if (prepared) return
    await http('POST', '/signup', { username: 'equity_bench', password: 'pass' })
    const res = await http('POST', '/signin', { username: 'equity_bench', password: 'pass' })
    const body = await res.json() as any
    token = body.token
    await http('POST', '/onramp', { amount: 500_000 }, token)

    // Create some positions
    for (let i = 0; i < 20; i++) {
      const makerRes = await http('POST', '/signup', { username: `eq_maker_${i}`, password: 'pass' })
      const makerBody = await makerRes.json() as any
      const makerSignin = await http('POST', '/signin', { username: `eq_maker_${i}`, password: 'pass' })
      const makerToken = (await makerSignin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, makerToken)
      await placeOrder(makerToken, {
        market: i % 2 === 0 ? 'SOL' : 'ETH',
        type: 'SHORT',
        qty: 10,
        orderType: 'limit',
        price: i % 2 === 0 ? 90 : 1900,
        margin: 1_000,
      })
      await placeOrder(token, {
        market: i % 2 === 0 ? 'SOL' : 'ETH',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: i % 2 === 0 ? 90 : 1900,
        margin: 1_000,
      })
    }
    prepared = true
  }

  bench('fetch equity', async () => {
    await prepare()
    await http('GET', '/equity/available', undefined, token)
  })
})

group('http – GET /positions/open/:marketId (sequential)', () => {
  let prepared = false
  let token = ''

  async function prepare() {
    if (prepared) return
    await http('POST', '/signup', { username: 'pos_bench', password: 'pass' })
    const res = await http('POST', '/signin', { username: 'pos_bench', password: 'pass' })
    const body = await res.json() as any
    token = body.token
    await http('POST', '/onramp', { amount: 500_000 }, token)

    for (let i = 0; i < 50; i++) {
      const makerRes = await http('POST', '/signup', { username: `pos_maker_${i}`, password: 'pass' })
      const makerBody = await makerRes.json() as any
      const makerSignin = await http('POST', '/signin', { username: `pos_maker_${i}`, password: 'pass' })
      const makerToken = (await makerSignin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, makerToken)
      await placeOrder(makerToken, {
        market: 'SOL',
        type: 'SHORT',
        qty: 5,
        orderType: 'limit',
        price: 90,
        margin: 500,
      })
      await placeOrder(token, {
        market: 'SOL',
        type: 'LONG',
        qty: 5,
        orderType: 'limit',
        price: 90,
        margin: 500,
      })
    }
    prepared = true
  }

  bench('fetch open positions', async () => {
    await prepare()
    await http('GET', '/positions/open/SOL', undefined, token)
  })
})

group('http – GET /orders/open/:marketId (sequential)', () => {
  let prepared = false
  let token = ''

  async function prepare() {
    if (prepared) return
    await http('POST', '/signup', { username: 'orders_bench', password: 'pass' })
    const res = await http('POST', '/signin', { username: 'orders_bench', password: 'pass' })
    const body = await res.json() as any
    token = body.token
    await http('POST', '/onramp', { amount: 5_000_000 }, token)

    // Place 200 open orders across different price levels
    for (let i = 0; i < 200; i++) {
      await placeOrder(token, {
        market: 'SOL',
        type: 'LONG',
        qty: 1,
        orderType: 'limit',
        price: 70 + (i % 30),
        margin: 100,
      })
    }
    prepared = true
  }

  bench('fetch open orders (200 orders)', async () => {
    await prepare()
    await http('GET', '/orders/open/SOL', undefined, token)
  })
})

group('http – GET /orders/:marketId (sequential)', () => {
  let prepared = false
  let token = ''
  let orderIds: number[] = []

  async function prepare() {
    if (prepared) return
    await http('POST', '/signup', { username: 'allorders_bench', password: 'pass' })
    const res = await http('POST', '/signin', { username: 'allorders_bench', password: 'pass' })
    const body = await res.json() as any
    token = body.token
    await http('POST', '/onramp', { amount: 50_000_000 }, token)

    // Place 500 orders (mix of open, filled, cancelled)
    for (let i = 0; i < 500; i++) {
      const orderRes = await placeOrder(token, {
        market: 'SOL',
        type: i % 2 === 0 ? 'LONG' : 'SHORT',
        qty: 1,
        orderType: 'limit',
        price: 70 + (i % 20),
        margin: 100,
      })
      const orderBody = await orderRes.json() as any
      if (orderBody.orderId) orderIds.push(orderBody.orderId)
    }
    prepared = true
  }

  bench('fetch all orders (500 orders)', async () => {
    await prepare()
    await http('GET', '/orders/SOL', undefined, token)
  })
})

group('http – GET /fills (sequential)', () => {
  let prepared = false

  async function prepare() {
    if (prepared) return

    // Create 100 fills
    for (let i = 0; i < 50; i++) {
      const makerRes = await http('POST', '/signup', { username: `fill_maker_${i}`, password: 'pass' })
      const makerBody = await makerRes.json() as any
      const makerSignin = await http('POST', '/signin', { username: `fill_maker_${i}`, password: 'pass' })
      const makerToken = (await makerSignin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, makerToken)

      const takerRes = await http('POST', '/signup', { username: `fill_taker_${i}`, password: 'pass' })
      const takerBody = await takerRes.json() as any
      const takerSignin = await http('POST', '/signin', { username: `fill_taker_${i}`, password: 'pass' })
      const takerToken = (await takerSignin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, takerToken)

      await placeOrder(makerToken, {
        market: 'SOL',
        type: 'SHORT',
        qty: 10,
        orderType: 'limit',
        price: 90,
        margin: 1_000,
      })
      await placeOrder(takerToken, {
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: 90,
        margin: 1_000,
      })
    }
    prepared = true
  }

  bench('fetch all fills (100 fills)', async () => {
    await prepare()
    await http('GET', '/fills')
  })
})

group('http – GET /fills?market=SOL (sequential)', () => {
  let prepared = false

  async function prepare() {
    if (prepared) return

    for (let i = 0; i < 50; i++) {
      const makerRes = await http('POST', '/signup', { username: `fmfill_maker_${i}`, password: 'pass' })
      const makerBody = await makerRes.json() as any
      const makerSignin = await http('POST', '/signin', { username: `fmfill_maker_${i}`, password: 'pass' })
      const makerToken = (await makerSignin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, makerToken)

      const takerRes = await http('POST', '/signup', { username: `fmfill_taker_${i}`, password: 'pass' })
      const takerBody = await takerRes.json() as any
      const takerSignin = await http('POST', '/signin', { username: `fmfill_taker_${i}`, password: 'pass' })
      const takerToken = (await takerSignin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, takerToken)

      await placeOrder(makerToken, {
        market: i % 2 === 0 ? 'SOL' : 'ETH',
        type: 'SHORT',
        qty: 10,
        orderType: 'limit',
        price: i % 2 === 0 ? 90 : 1900,
        margin: 1_000,
      })
      await placeOrder(takerToken, {
        market: i % 2 === 0 ? 'SOL' : 'ETH',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: i % 2 === 0 ? 90 : 1900,
        margin: 1_000,
      })
    }
    prepared = true
  }

  bench('fetch fills filtered by market', async () => {
    await prepare()
    await http('GET', '/fills?market=SOL')
  })
})

// ─── Benchmark: End-to-end trade flow ────────────────────────────────────────

group('http – full trade lifecycle (signup → onboard → place → match → query)', () => {
  let counter = 0

  bench('complete trade round trip', async () => {
    counter++
    const ts = Date.now()

    // Signup maker
    const makerRes = await http('POST', '/signup', {
      username: `e2e_maker_${ts}_${counter}`,
      password: 'pass',
    })
    const makerBody = await makerRes.json() as any

    // Signin maker
    const makerLogin = await http('POST', '/signin', {
      username: `e2e_maker_${ts}_${counter}`,
      password: 'pass',
    })
    const makerToken = (await makerLogin.json() as any).token

    // Onboard maker
    await http('POST', '/onramp', { amount: 1_000_000 }, makerToken)

    // Signup taker
    const takerRes = await http('POST', '/signup', {
      username: `e2e_taker_${ts}_${counter}`,
      password: 'pass',
    })

    // Signin taker
    const takerLogin = await http('POST', '/signin', {
      username: `e2e_taker_${ts}_${counter}`,
      password: 'pass',
    })
    const takerToken = (await takerLogin.json() as any).token

    // Onboard taker
    await http('POST', '/onramp', { amount: 1_000_000 }, takerToken)

    // Maker places sell
    await placeOrder(makerToken, {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1_000,
    })

    // Taker places buy → matches
    await placeOrder(takerToken, {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      orderType: 'limit',
      price: 90,
      margin: 1_000,
    })

    // Query fills
    await http('GET', '/fills')
  })
})

// ─── Benchmark: Concurrent writes ────────────────────────────────────────────

group('http – concurrent order placement (20 parallel orders, no match)', () => {
  let prepared = false
  const tokens: string[] = []

  async function prepare() {
    if (prepared) return
    for (let i = 0; i < 20; i++) {
      await http('POST', '/signup', { username: `conc_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `conc_${i}`, password: 'pass' })
      const body = await res.json() as any
      tokens.push(body.token)
      await http('POST', '/onramp', { amount: 10_000_000 }, body.token)
    }
    prepared = true
  }

  let batch = 0
  bench('20 concurrent unmatched orders', async () => {
    await prepare()
    batch++
    const promises = tokens.map((token, i) =>
      placeOrder(token, {
        market: 'SOL',
        type: 'LONG',
        qty: 1,
        orderType: 'limit',
        price: 70 + ((batch + i) % 20),
        margin: 100,
      })
    )
    await Promise.all(promises)
  })
})

group('http – concurrent order placement (20 parallel orders, instant match)', () => {
  let prepared = false
  const makerTokens: string[] = []
  const takerTokens: string[] = []

  async function prepare() {
    if (prepared) return

    // Create 20 makers with resting sells
    for (let i = 0; i < 20; i++) {
      await http('POST', '/signup', { username: `cmaker_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `cmaker_${i}`, password: 'pass' })
      const body = await res.json() as any
      makerTokens.push(body.token)
      await http('POST', '/onramp', { amount: 10_000_000 }, body.token)
      await placeOrder(body.token, {
        market: 'SOL',
        type: 'SHORT',
        qty: 10,
        orderType: 'limit',
        price: 100,
        margin: 1_000,
      })
    }

    // Create 20 takers
    for (let i = 0; i < 20; i++) {
      await http('POST', '/signup', { username: `ctaker_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `ctaker_${i}`, password: 'pass' })
      const body = await res.json() as any
      takerTokens.push(body.token)
      await http('POST', '/onramp', { amount: 10_000_000 }, body.token)
    }

    prepared = true
  }

  let batch = 0
  bench('20 concurrent matched orders', async () => {
    await prepare()
    batch++
    const promises = takerTokens.map(token =>
      placeOrder(token, {
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: 100,
        margin: 1_000,
      })
    )
    await Promise.all(promises)
  })
})

// ─── Benchmark: Concurrent reads ─────────────────────────────────────────────

group('http – concurrent reads (20 parallel equity queries)', () => {
  let prepared = false
  const tokens: string[] = []

  async function prepare() {
    if (prepared) return
    for (let i = 0; i < 20; i++) {
      await http('POST', '/signup', { username: `cread_${i}`, password: 'pass' })
      const res = await http('POST', '/signin', { username: `cread_${i}`, password: 'pass' })
      const body = await res.json() as any
      tokens.push(body.token)
      await http('POST', '/onramp', { amount: 500_000 }, body.token)

      // Give each user some positions
      const makerRes = await http('POST', '/signup', { username: `cread_maker_${i}`, password: 'pass' })
      const makerBody = await makerRes.json() as any
      const makerLogin = await http('POST', '/signin', { username: `cread_maker_${i}`, password: 'pass' })
      const makerToken = (await makerLogin.json() as any).token
      await http('POST', '/onramp', { amount: 1_000_000 }, makerToken)
      await placeOrder(makerToken, {
        market: 'SOL',
        type: 'SHORT',
        qty: 10,
        orderType: 'limit',
        price: 90,
        margin: 1_000,
      })
      await placeOrder(body.token, {
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        orderType: 'limit',
        price: 90,
        margin: 1_000,
      })
    }
    prepared = true
  }

  bench('20 parallel equity queries', async () => {
    await prepare()
    const promises = tokens.map(token =>
      http('GET', '/equity/available', undefined, token)
    )
    await Promise.all(promises)
  })
})

// ─── Run ─────────────────────────────────────────────────────────────────────

await run()
server?.close()
