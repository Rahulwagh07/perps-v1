import { describe, test, expect, beforeEach } from 'bun:test'
import { calEquity, calPnl } from '../utils/pnl'
import { applyPositionFill, openNewPosition } from '../utils/position'
import { GenerateToken, getUserFromRequest } from '../utils/auth'
import { orderbooks, users, sessions, resetStore } from '../store'
import type { Position, User } from '../types'

beforeEach(() => {
  resetStore()
})

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 1,
    username: 'test',
    password: 'pass',
    collateral: { available: 1000, locked: 0 },
    positions: [],
    orders: [],
    ...overrides,
  }
}

describe('calPnl', () => {
  test('should calculate positive pnl for LONG', () => {
    const pos: Position = {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      margin: 500,
      averagePrice: 80,
      liquidationPrice: 64,
    }
    expect(calPnl(pos, 90)).toBe(100) // (90-80) * 10
  })

  test('should calculate negative pnl for LONG', () => {
    const pos: Position = {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      margin: 500,
      averagePrice: 90,
      liquidationPrice: 72,
    }
    expect(calPnl(pos, 80)).toBe(-100) // (80-90) * 10
  })

  test('should calculate positive pnl for SHORT', () => {
    const pos: Position = {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      margin: 500,
      averagePrice: 90,
      liquidationPrice: 108,
    }
    expect(calPnl(pos, 80)).toBe(100) // -(80-90) * 10
  })

  test('should calculate negative pnl for SHORT', () => {
    const pos: Position = {
      market: 'SOL',
      type: 'SHORT',
      qty: 10,
      margin: 500,
      averagePrice: 90,
      liquidationPrice: 108,
    }
    expect(calPnl(pos, 100)).toBe(-100) // -(100-90) * 10
  })

  test('should return 0 when mark price equals average price', () => {
    const pos: Position = {
      market: 'SOL',
      type: 'LONG',
      qty: 10,
      margin: 500,
      averagePrice: 90,
      liquidationPrice: 72,
    }
    expect(calPnl(pos, 90)).toBe(0)
  })
})

describe('calEquity', () => {
  test('should return collateral when no positions', () => {
    const user = makeUser()
    expect(calEquity(user)).toBe(1000)
  })

  test('should include locked collateral', () => {
    const user = makeUser({ collateral: { available: 500, locked: 500 } })
    expect(calEquity(user)).toBe(1000)
  })

  test('should include unrealized pnl for LONG position', () => {
    orderbooks.SOL = {
      bids: {},
      asks: {},
      lastTradedPrice: 100,
      indexPrice: 100,
    }
    const user = makeUser({
      collateral: { available: 500, locked: 500 },
      positions: [
        {
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          margin: 500,
          averagePrice: 80,
          liquidationPrice: 64,
        },
      ],
    })
    // equity = 1000 + (100-80)*10 = 1000 + 200 = 1200
    expect(calEquity(user)).toBe(1200)
  })

  test('should include unrealized pnl for SHORT position', () => {
    orderbooks.SOL = {
      bids: {},
      asks: {},
      lastTradedPrice: 80,
      indexPrice: 80,
    }
    const user = makeUser({
      collateral: { available: 500, locked: 500 },
      positions: [
        {
          market: 'SOL',
          type: 'SHORT',
          qty: 10,
          margin: 500,
          averagePrice: 90,
          liquidationPrice: 108,
        },
      ],
    })
    // equity = 1000 + -(80-90)*10 = 1000 + 100 = 1100
    expect(calEquity(user)).toBe(1100)
  })

  test('should handle negative unrealized pnl', () => {
    orderbooks.SOL = {
      bids: {},
      asks: {},
      lastTradedPrice: 70,
      indexPrice: 70,
    }
    const user = makeUser({
      collateral: { available: 500, locked: 500 },
      positions: [
        {
          market: 'SOL',
          type: 'LONG',
          qty: 10,
          margin: 500,
          averagePrice: 80,
          liquidationPrice: 64,
        },
      ],
    })
    // equity = 1000 + (70-80)*10 = 1000 - 100 = 900
    expect(calEquity(user)).toBe(900)
  })
})

describe('openNewPosition', () => {
  test('should create a LONG position with correct liquidation price', () => {
    const user = makeUser()
    openNewPosition(user, 'SOL', 'LONG', 10, 100, 500)
    expect(user.positions.length).toBe(1)
    expect(user.positions[0].type).toBe('LONG')
    expect(user.positions[0].liquidationPrice).toBe(80) // 100 * 0.8
    expect(user.positions[0].averagePrice).toBe(100)
    expect(user.positions[0].qty).toBe(10)
    expect(user.positions[0].margin).toBe(500)
  })

  test('should create a SHORT position with correct liquidation price', () => {
    const user = makeUser()
    openNewPosition(user, 'SOL', 'SHORT', 10, 100, 500)
    expect(user.positions.length).toBe(1)
    expect(user.positions[0].type).toBe('SHORT')
    expect(user.positions[0].liquidationPrice).toBe(120) // 100 * 1.2
  })
})

describe('applyPositionFill', () => {
  test('should open new position when no existing position', () => {
    const user = makeUser()
    applyPositionFill(user, 'SOL', 'LONG', 10, 90, 500)
    expect(user.positions.length).toBe(1)
    expect(user.positions[0].market).toBe('SOL')
    expect(user.positions[0].type).toBe('LONG')
    expect(user.positions[0].qty).toBe(10)
    expect(user.positions[0].averagePrice).toBe(90)
  })

  test('should increase existing position (averaging in)', () => {
    const user = makeUser()
    applyPositionFill(user, 'SOL', 'LONG', 10, 80, 400)
    applyPositionFill(user, 'SOL', 'LONG', 10, 100, 600)
    expect(user.positions.length).toBe(1)
    expect(user.positions[0].qty).toBe(20)
    // average price = (80*10 + 100*10) / 20 = 90
    expect(user.positions[0].averagePrice).toBe(90)
    expect(user.positions[0].margin).toBe(1000)
  })

  test('should fully close opposing position', () => {
    const user = makeUser()
    // Open LONG 10
    applyPositionFill(user, 'SOL', 'LONG', 10, 90, 500)

    // Close with SHORT 10
    applyPositionFill(user, 'SOL', 'SHORT', 10, 100, 0)

    const closedPos = user.positions.find(p => p.status === 'closed')
    expect(closedPos).toBeDefined()
    expect(closedPos!.type).toBe('LONG')
    expect(closedPos!.pnL).toBe(100) // (100-90)*10
  })

  test('should partially close opposing position', () => {
    const user = makeUser()
    // Open LONG 10
    applyPositionFill(user, 'SOL', 'LONG', 10, 90, 500)

    // Close 5 with SHORT
    applyPositionFill(user, 'SOL', 'SHORT', 5, 100, 0)

    const openPos = user.positions.find(p => p.status === 'open')
    expect(openPos).toBeDefined()
    expect(openPos!.type).toBe('LONG')
    expect(openPos!.qty).toBe(5) // reduced from 10 to 5
  })

  test('should flip position when closing more than existing', () => {
    const user = makeUser()
    // Open LONG 5
    applyPositionFill(user, 'SOL', 'LONG', 5, 90, 250)

    // Close 5 + open 5 SHORT
    applyPositionFill(user, 'SOL', 'SHORT', 10, 100, 500)

    const closedPos = user.positions.find(p => p.status === 'closed')
    expect(closedPos).toBeDefined()
    expect(closedPos!.type).toBe('LONG')

    const newShortPos = user.positions.find(
      p => p.type === 'SHORT' && p.status === 'open'
    )
    expect(newShortPos).toBeDefined()
    expect(newShortPos!.qty).toBe(5)
    expect(newShortPos!.averagePrice).toBe(100)
  })

  test('should update lastTradedPrice on orderbook', () => {
    const user = makeUser()
    applyPositionFill(user, 'SOL', 'LONG', 10, 95, 500)
    expect(orderbooks.SOL.lastTradedPrice).toBe(95)
  })

  test('should handle closing a SHORT position', () => {
    const user = makeUser()
    // Open SHORT 10 at 90
    applyPositionFill(user, 'SOL', 'SHORT', 10, 90, 500)

    // Close SHORT with LONG 10 at 80
    applyPositionFill(user, 'SOL', 'LONG', 10, 80, 0)

    const closedPos = user.positions.find(p => p.status === 'closed')
    expect(closedPos).toBeDefined()
    expect(closedPos!.type).toBe('SHORT')
    // pnl for SHORT: -(80-90)*10 = 100
    expect(closedPos!.pnL).toBe(100)
  })
})

describe('GenerateToken', () => {
  test('should generate a non-empty string', () => {
    const token = GenerateToken()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  test('should generate unique tokens', () => {
    const t1 = GenerateToken()
    const t2 = GenerateToken()
    expect(t1).not.toBe(t2)
  })
})

describe('getUserFromRequest', () => {
  test('should return user with valid token', () => {
    const user = makeUser({ userId: 42 })
    users.push(user)
    sessions['test-token'] = 42

    const req = {
      headers: { authorization: 'Bearer test-token' },
    } as any

    const found = getUserFromRequest(req)
    expect(found).toBeDefined()
    expect(found!.userId).toBe(42)
  })

  test('should return undefined with no auth header', () => {
    const req = { headers: {} } as any
    const found = getUserFromRequest(req)
    expect(found).toBeUndefined()
  })

  test('should return undefined with invalid token', () => {
    const req = {
      headers: { authorization: 'Bearer invalid-token' },
    } as any
    const found = getUserFromRequest(req)
    expect(found).toBeUndefined()
  })

  test('should return undefined with Bearer prefix missing', () => {
    sessions['test-token'] = 1
    const req = {
      headers: { authorization: 'test-token' },
    } as any
    const found = getUserFromRequest(req)
    expect(found).toBeUndefined()
  })
})
