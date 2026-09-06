import { bench, group, run } from 'mitata'
import { matchOrder } from './engine'
import { resetStore, users, orderbooks, fills, sessions, incrementUserId, incrementOrderId, nextOrderId } from './store'
import type { User, Order, Position } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createUser(id: number, username: string, collateral = 100_000): User {
  const user: User = {
    userId: id,
    username,
    password: 'pass',
    collateral: { available: collateral, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)
  return user
}

function placeRestingOrder(
  user: User,
  market: string,
  side: 'LONG' | 'SHORT',
  price: number,
  qty: number
): Order {
  const orderId = incrementOrderId()
  const margin = qty * price * 0.1

  user.collateral.available -= margin
  user.collateral.locked += margin

  const order: Order = {
    orderId,
    market,
    type: side,
    qty,
    filledQty: 0,
    margin,
    orderType: 'limit',
    price,
    status: 'open',
    createdAt: new Date(),
  }
  user.orders.push(order)

  const ob = orderbooks[market]
  const sideBook = side === 'LONG' ? ob.bids : ob.asks
  const priceStr = price.toString()

  if (!sideBook[priceStr]) {
    sideBook[priceStr] = { availableQty: 0, openOrders: [] }
  }
  sideBook[priceStr].availableQty += qty
  sideBook[priceStr].openOrders.push({
    userId: user.userId,
    qty,
    filledQty: 0,
    orderId,
    createdAt: new Date(),
  })

  return order
}

function createIncomingOrder(
  user: User,
  market: string,
  side: 'LONG' | 'SHORT',
  price: number,
  qty: number
): Order {
  const orderId = incrementOrderId()
  const margin = qty * price * 0.1

  user.collateral.available -= margin
  user.collateral.locked += margin

  const order: Order = {
    orderId,
    market,
    type: side,
    qty,
    filledQty: 0,
    margin,
    orderType: 'limit',
    price,
    status: 'open',
    createdAt: new Date(),
  }
  user.orders.push(order)

  const ob = orderbooks[market]
  const sideBook = side === 'LONG' ? ob.bids : ob.asks
  const priceStr = price.toString()

  if (!sideBook[priceStr]) {
    sideBook[priceStr] = { availableQty: 0, openOrders: [] }
  }
  sideBook[priceStr].availableQty += qty
  sideBook[priceStr].openOrders.push({
    userId: user.userId,
    qty,
    filledQty: 0,
    orderId,
    createdAt: new Date(),
  })

  return order
}

function setupOrderbook(market: string, numLevels: number, ordersPerLevel: number) {
  resetStore()
  orderbooks[market] = {
    bids: {},
    asks: {},
    lastTradedPrice: 100,
    indexPrice: 100,
  }

  // Seed users: 1 maker per level + 1 taker
  const makers: User[] = []
  for (let i = 0; i < numLevels * ordersPerLevel; i++) {
    makers.push(createUser(incrementUserId(), `maker_${i}`, 500_000))
  }
  const taker = createUser(incrementUserId(), 'taker', 500_000)

  // Populate asks (resting sell orders) across price levels
  let makerIdx = 0
  for (let lvl = 0; lvl < numLevels; lvl++) {
    const price = 100 + lvl
    for (let o = 0; o < ordersPerLevel; o++) {
      placeRestingOrder(makers[makerIdx++], market, 'SHORT', price, 10)
    }
  }

  return { makers, taker }
}

// ─── Benchmark: Engine – single match ────────────────────────────────────────

group('engine – single order match (1 price level, 1 resting order)', () => {
  bench('matchOrder', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    const maker = createUser(1, 'maker', 100_000)
    const taker = createUser(2, 'taker', 100_000)

    const resting = placeRestingOrder(maker, 'BENCH', 'SHORT', 100, 10)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 100, 10)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

group('engine – 10 price levels × 1 order each', () => {
  bench('matchOrder sweeps 10 levels', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    for (let i = 0; i < 10; i++) {
      const maker = createUser(incrementUserId(), `m${i}`, 100_000)
      placeRestingOrder(maker, 'BENCH', 'SHORT', 100 + i, 5)
    }

    const taker = createUser(incrementUserId(), 'taker', 500_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 110, 50)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

group('engine – 1 price level × 10 resting orders', () => {
  bench('matchOrder against 10 resting orders', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    for (let i = 0; i < 10; i++) {
      const maker = createUser(incrementUserId(), `m${i}`, 100_000)
      placeRestingOrder(maker, 'BENCH', 'SHORT', 100, 10)
    }

    const taker = createUser(incrementUserId(), 'taker', 500_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 100, 100)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

group('engine – 50 price levels × 5 orders each', () => {
  bench('matchOrder sweeps 250 resting orders', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    for (let lvl = 0; lvl < 50; lvl++) {
      for (let o = 0; o < 5; o++) {
        const maker = createUser(incrementUserId(), `m${lvl}_${o}`, 100_000)
        placeRestingOrder(maker, 'BENCH', 'SHORT', 100 + lvl, 10)
      }
    }

    const taker = createUser(incrementUserId(), 'taker', 50_000_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 150, 2500)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

// ─── Benchmark: Engine – no match (miss) ─────────────────────────────────────

group('engine – no match (buy price below best ask)', () => {
  bench('matchOrder returns immediately', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    const maker = createUser(1, 'maker', 100_000)
    placeRestingOrder(maker, 'BENCH', 'SHORT', 105, 10)

    const taker = createUser(2, 'taker', 100_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 100, 10)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

group('engine – no match (empty opposite side)', () => {
  bench('matchOrder returns immediately', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    const taker = createUser(1, 'taker', 100_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 100, 10)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

// ─── Benchmark: Engine – large orderbook stress ──────────────────────────────

group('engine – 200 price levels × 10 orders each (2000 resting)', () => {
  bench('matchOrder sweeps 2000 resting orders', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    for (let lvl = 0; lvl < 200; lvl++) {
      for (let o = 0; o < 10; o++) {
        const maker = createUser(incrementUserId(), `m${lvl}_${o}`, 100_000)
        placeRestingOrder(maker, 'BENCH', 'SHORT', 100 + lvl, 10)
      }
    }

    const taker = createUser(incrementUserId(), 'taker', 5_000_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 300, 20000)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

// ─── Benchmark: Engine – partial fill ────────────────────────────────────────

group('engine – partial fill (taker qty < resting qty)', () => {
  bench('partial fill single resting order', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    const maker = createUser(1, 'maker', 100_000)
    placeRestingOrder(maker, 'BENCH', 'SHORT', 100, 100)

    const taker = createUser(2, 'taker', 100_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 100, 3)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

// ─── Benchmark: Engine – accumulated position (same direction) ───────────────

group('engine – position accumulation (3 fills into same LONG)', () => {
  bench('3 sequential matches build position', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    const taker = createUser(1, 'taker', 500_000)

    // 3 resting sells at different prices
    for (let i = 0; i < 3; i++) {
      const maker = createUser(incrementUserId(), `m${i}`, 100_000)
      placeRestingOrder(maker, 'BENCH', 'SHORT', 100 + i, 10)
    }

    // Single buy that sweeps all 3 levels
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 103, 30)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

// ─── Benchmark: Engine – cancel + match (cancelled order in book) ────────────

group('engine – matching with cancelled orders in the book', () => {
  bench('skips cancelled orders then matches', () => {
    resetStore()
    orderbooks['BENCH'] = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }

    // Create 10 resting orders, cancel half of them
    for (let i = 0; i < 10; i++) {
      const maker = createUser(incrementUserId(), `m${i}`, 100_000)
      const resting = placeRestingOrder(maker, 'BENCH', 'SHORT', 100, 10)
      if (i % 2 === 0) {
        resting.status = 'cancelled'
      }
    }

    const taker = createUser(incrementUserId(), 'taker', 100_000)
    const incoming = createIncomingOrder(taker, 'BENCH', 'LONG', 100, 50)

    matchOrder(incoming.orderId, 'BENCH')
  })
})

// ─── Benchmark: Store – fill array growth ────────────────────────────────────

group('store – fills array with 10,000 entries', () => {
  bench('push new fill into large array', () => {
    resetStore()
    // Pre-fill array
    for (let i = 0; i < 10_000; i++) {
      fills.push({
        fillId: i,
        maker: 1,
        taker: 2,
        market: 'SOL',
        qty: 1,
        price: 100,
        long: 1,
        short: 2,
        createdAt: new Date(),
      })
    }

    fills.push({
      fillId: 10_001,
      maker: 1,
      taker: 2,
      market: 'SOL',
      qty: 1,
      price: 100,
      long: 1,
      short: 2,
      createdAt: new Date(),
    })
  })
})

group('store – user lookup with 500 users', () => {
  bench('users.find() by userId', () => {
    resetStore()
    for (let i = 0; i < 500; i++) {
      createUser(i + 1, `user_${i}`, 100_000)
    }

    // Lookup last user
    users.find(u => u.userId === 500)
  })
})

group('store – user lookup with 500 users (order lookup)', () => {
  bench('find order across 500 users × 20 orders each', () => {
    resetStore()
    for (let i = 0; i < 500; i++) {
      const user = createUser(i + 1, `user_${i}`, 10_000_000)
      for (let j = 0; j < 20; j++) {
        const orderId = incrementOrderId()
        user.orders.push({
          orderId,
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          filledQty: 0,
          margin: 100,
          orderType: 'limit',
          price: 90 + j,
          status: 'open',
          createdAt: new Date(),
        })
      }
    }

    // Find a specific order (worst case: last user, last order)
    const targetOrderId = 500 * 20
    for (const user of users) {
      const order = user.orders.find(o => o.orderId === targetOrderId)
      if (order) break
    }
  })
})

// ─── Benchmark: Position utils ───────────────────────────────────────────────

group('utils – calEquity (user with 50 positions)', () => {
  bench('calEquity computation', async () => {
    resetStore()
    const { calEquity } = await import('./utils/pnl')

    const user = createUser(1, 'whale', 100_000)
    for (let i = 0; i < 50; i++) {
      const market = i % 2 === 0 ? 'SOL' : 'ETH'
      orderbooks[market] = {
        bids: {},
        asks: {},
        lastTradedPrice: 100 + i,
        indexPrice: 100 + i,
      }
      user.positions.push({
        market,
        type: i % 2 === 0 ? 'LONG' : 'SHORT',
        qty: 100,
        margin: 10_000,
        averagePrice: 90 + i,
        liquidationPrice: 70 + i,
        status: 'open',
        pnL: 0,
      })
    }

    calEquity(user)
  })
})

group('utils – calPnl (single position)', () => {
  bench('calPnl computation', async () => {
    const { calPnl } = await import('./utils/pnl')
    calPnl(
      {
        market: 'SOL',
        type: 'LONG',
        qty: 1000,
        margin: 50_000,
        averagePrice: 95,
        liquidationPrice: 76,
        status: 'open',
        pnL: 0,
      },
      105
    )
  })
})

// ─── Run ─────────────────────────────────────────────────────────────────────

await run()
