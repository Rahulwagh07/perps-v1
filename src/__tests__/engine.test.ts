import { describe, test, expect, beforeEach } from 'bun:test'
import { matchOrder } from '../engine'
import { users, orderbooks, fills, resetStore } from '../store'

beforeEach(() => {
  resetStore()
})

function addUser(username: string) {
  const user = {
    userId: users.length + 1,
    username,
    password: 'pass',
    collateral: { available: 10000, locked: 0 },
    positions: [],
    orders: [],
  }
  users.push(user)
  return user
}

function addOrder(
  user: ReturnType<typeof addUser>,
  overrides: Partial<{
    orderId: number
    market: string
    type: 'LONG' | 'SHORT'
    qty: number
    filledQty: number
    margin: number
    orderType: 'limit' | 'market'
    price: number
    status: 'filled' | 'open' | 'partial' | 'cancelled' | 'closed'
  }> = {}
) {
  const order = {
    orderId: overrides.orderId ?? user.orders.length + 1,
    market: overrides.market ?? 'SOL',
    type: overrides.type ?? 'LONG',
    qty: overrides.qty ?? 10,
    filledQty: overrides.filledQty ?? 0,
    margin: overrides.margin ?? 500,
    orderType: overrides.orderType ?? 'limit',
    price: overrides.price ?? 90,
    status: overrides.status ?? 'open',
    createdAt: new Date(),
  }
  user.orders.push(order)
  return order
}

function addToOrderbook(
  market: string,
  side: 'bids' | 'asks',
  price: number,
  orderId: number,
  userId: number,
  qty: number
) {
  const ob = orderbooks[market]
  const priceStr = price.toString()
  if (!ob[side][priceStr]) {
    ob[side][priceStr] = { availableQty: 0, openOrders: [] }
  }
  ob[side][priceStr].availableQty += qty
  ob[side][priceStr].openOrders.push({
    userId,
    qty,
    filledQty: 0,
    orderId,
    createdAt: new Date(),
  })
}

describe('matchOrder', () => {
  test('should not match if market does not exist', () => {
    const user = addUser('alice')
    addOrder(user, { orderId: 1, market: 'NONEXISTENT' })
    matchOrder(1, 'NONEXISTENT')
    expect(user.orders[0].status).toBe('open')
    expect(user.orders[0].filledQty).toBe(0)
  })

  test('should not match cancelled order', () => {
    const user = addUser('alice')
    addOrder(user, { orderId: 1, status: 'cancelled' })
    matchOrder(1, 'SOL')
    expect(user.orders[0].status).toBe('cancelled')
  })

  test('should match a buy against resting sell', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    // Alice places a limit sell at 90
    const aliceOrder = addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'asks', 90, 1, alice.userId, 10)

    // Bob places a limit buy at 90 (should match)
    const bobOrder = addOrder(bob, {
      orderId: 2,
      type: 'LONG',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'bids', 90, 2, bob.userId, 10)

    matchOrder(2, 'SOL')

    expect(bobOrder.status).toBe('filled')
    expect(bobOrder.filledQty).toBe(10)
    expect(aliceOrder.status).toBe('filled')
    expect(aliceOrder.filledQty).toBe(10)
    expect(fills.length).toBe(1)
    expect(fills[0].price).toBe(90)
    expect(fills[0].qty).toBe(10)
    expect(fills[0].maker).toBe(alice.userId)
    expect(fills[0].taker).toBe(bob.userId)
    expect(fills[0].long).toBe(bob.userId)
    expect(fills[0].short).toBe(alice.userId)
  })

  test('should match a sell against resting buy', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    // Bob places a limit buy at 90
    const bobOrder = addOrder(bob, {
      orderId: 1,
      type: 'LONG',
      price: 90,
      qty: 5,
      margin: 450,
    })
    addToOrderbook('SOL', 'bids', 90, 1, bob.userId, 5)

    // Alice places a limit sell at 90 (should match)
    const aliceOrder = addOrder(alice, {
      orderId: 2,
      type: 'SHORT',
      price: 90,
      qty: 5,
      margin: 450,
    })
    addToOrderbook('SOL', 'asks', 90, 2, alice.userId, 5)

    matchOrder(2, 'SOL')

    expect(aliceOrder.status).toBe('filled')
    expect(aliceOrder.filledQty).toBe(5)
    expect(bobOrder.status).toBe('filled')
    expect(bobOrder.filledQty).toBe(5)
    expect(fills[0].long).toBe(bob.userId)
    expect(fills[0].short).toBe(alice.userId)
  })

  test('should partially fill an order', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    // Alice sells 5 at 90
    const aliceOrder = addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 90,
      qty: 5,
      margin: 450,
    })
    addToOrderbook('SOL', 'asks', 90, 1, alice.userId, 5)

    // Bob buys 10 at 90 (only 5 can fill)
    const bobOrder = addOrder(bob, {
      orderId: 2,
      type: 'LONG',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'bids', 90, 2, bob.userId, 10)

    matchOrder(2, 'SOL')

    expect(aliceOrder.status).toBe('filled')
    expect(aliceOrder.filledQty).toBe(5)
    expect(bobOrder.status).toBe('partial')
    expect(bobOrder.filledQty).toBe(5)
  })

  test('should match at correct price level (best price first)', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')
    const charlie = addUser('charlie')

    // Alice sells 5 at 92
    addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 92,
      qty: 5,
      margin: 460,
    })
    addToOrderbook('SOL', 'asks', 92, 1, alice.userId, 5)

    // Bob sells 5 at 88
    addOrder(bob, {
      orderId: 2,
      type: 'SHORT',
      price: 88,
      qty: 5,
      margin: 440,
    })
    addToOrderbook('SOL', 'asks', 88, 2, bob.userId, 5)

    // Charlie buys 10 at 93 → should fill 88 first, then 92
    const charlieOrder = addOrder(charlie, {
      orderId: 3,
      type: 'LONG',
      price: 93,
      qty: 10,
      margin: 930,
    })
    addToOrderbook('SOL', 'bids', 93, 3, charlie.userId, 10)

    matchOrder(3, 'SOL')

    expect(charlieOrder.status).toBe('filled')
    expect(charlieOrder.filledQty).toBe(10)
    expect(fills.length).toBe(2)
    // First fill at 88 (best ask for buyer)
    expect(fills[0].price).toBe(88)
    expect(fills[0].qty).toBe(5)
    // Second fill at 92
    expect(fills[1].price).toBe(92)
    expect(fills[1].qty).toBe(5)
  })

  test('should update lastTradedPrice on match', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 95,
      qty: 10,
      margin: 950,
    })
    addToOrderbook('SOL', 'asks', 95, 1, alice.userId, 10)

    addOrder(bob, {
      orderId: 2,
      type: 'LONG',
      price: 95,
      qty: 10,
      margin: 950,
    })
    addToOrderbook('SOL', 'bids', 95, 2, bob.userId, 10)

    matchOrder(2, 'SOL')

    expect(orderbooks.SOL.lastTradedPrice).toBe(95)
  })

  test('should handle buy order not matching due to price limit', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    // Alice sells at 95
    addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 95,
      qty: 10,
      margin: 950,
    })
    addToOrderbook('SOL', 'asks', 95, 1, alice.userId, 10)

    // Bob buys at 90 (below ask, should not match)
    const bobOrder = addOrder(bob, {
      orderId: 2,
      type: 'LONG',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'bids', 90, 2, bob.userId, 10)

    matchOrder(2, 'SOL')

    expect(bobOrder.status).toBe('open')
    expect(bobOrder.filledQty).toBe(0)
    expect(fills.length).toBe(0)
  })

  test('should handle sell order not matching due to price limit', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    // Bob buys at 85
    addOrder(bob, {
      orderId: 1,
      type: 'LONG',
      price: 85,
      qty: 10,
      margin: 850,
    })
    addToOrderbook('SOL', 'bids', 85, 1, bob.userId, 10)

    // Alice sells at 90 (above bid, should not match)
    const aliceOrder = addOrder(alice, {
      orderId: 2,
      type: 'SHORT',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'asks', 90, 2, alice.userId, 10)

    matchOrder(2, 'SOL')

    expect(aliceOrder.status).toBe('open')
    expect(aliceOrder.filledQty).toBe(0)
    expect(fills.length).toBe(0)
  })

  test('should clean up price level when all orders filled', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'asks', 90, 1, alice.userId, 10)

    addOrder(bob, {
      orderId: 2,
      type: 'LONG',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'bids', 90, 2, bob.userId, 10)

    matchOrder(2, 'SOL')

    expect(orderbooks.SOL.asks['90']).toBeUndefined()
    expect(orderbooks.SOL.bids['90']).toBeUndefined()
  })

  test('should not match cancelled resting order', () => {
    const alice = addUser('alice')
    const bob = addUser('bob')

    // Alice places then cancels
    const aliceOrder = addOrder(alice, {
      orderId: 1,
      type: 'SHORT',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'asks', 90, 1, alice.userId, 10)
    aliceOrder.status = 'cancelled'

    // Bob tries to buy
    const bobOrder = addOrder(bob, {
      orderId: 2,
      type: 'LONG',
      price: 90,
      qty: 10,
      margin: 900,
    })
    addToOrderbook('SOL', 'bids', 90, 2, bob.userId, 10)

    matchOrder(2, 'SOL')

    expect(bobOrder.status).toBe('open')
    expect(bobOrder.filledQty).toBe(0)
  })
})
