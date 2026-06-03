import type { User, Orderbooks, Fill } from './types'

export let nextUserId = 3
export let nextOrderId = 20
export let nextFillId = 3

export const incrementUserId = () => nextUserId++
export const incrementOrderId = () => nextOrderId++
export const incrementFillId = () => nextFillId++

export const users: User[] = [
  {
    userId: 1,
    username: 'harkirat',
    password: 123123,
    collateral: { available: 2000, locked: 1000 },
    positions: [
      {
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        margin: 500,
        liquidationPrice: 72,
        averagePrice: 90,
        status: 'open',
        pnL: 0,
      },
      {
        market: 'ETH',
        type: 'SHORT',
        qty: 1,
        margin: 500,
        liquidationPrice: 2280,
        averagePrice: 1900,
        status: 'open',
        pnL: 0,
      },
    ],
    orders: [
      {
        orderId: 1,
        market: 'SOL',
        type: 'LONG',
        qty: 10,
        filledQty: 10,
        margin: 500,
        orderType: 'limit',
        price: 90,
        status: 'filled',
        createdAt: new Date(),
      },
      {
        orderId: 2,
        market: 'ETH',
        type: 'SHORT',
        qty: 10,
        filledQty: 10,
        margin: 500,
        orderType: 'limit',
        price: 1900,
        status: 'filled',
        createdAt: new Date(),
      },
      {
        orderId: 3,
        market: 'BTC',
        type: 'LONG',
        qty: 10,
        filledQty: 0,
        margin: 500,
        orderType: 'limit',
        price: 1900,
        status: 'cancelled',
        createdAt: new Date(),
      },
    ],
  },
  {
    userId: 2,
    username: 'raman',
    password: 123123,
    collateral: { available: 2000, locked: 2000 },
    positions: [
      {
        market: 'SOL',
        type: 'SHORT',
        qty: 10,
        margin: 1000,
        liquidationPrice: 108,
        averagePrice: 90,
        status: 'open',
        pnL: 0,
      },
      {
        market: 'ETH',
        type: 'LONG',
        qty: 1,
        margin: 1000,
        liquidationPrice: 1520,
        averagePrice: 1900,
        status: 'open',
        pnL: 0,
      },
    ],
    orders: [
      {
        orderId: 10,
        market: 'SOL',
        type: 'SHORT',
        qty: 10,
        filledQty: 10,
        margin: 500,
        orderType: 'market',
        price: 90,
        status: 'filled',
        createdAt: new Date(),
      },
      {
        orderId: 11,
        market: 'ETH',
        type: 'LONG',
        qty: 10,
        filledQty: 10,
        margin: 500,
        orderType: 'market',
        price: 1900,
        status: 'filled',
        createdAt: new Date(),
      },
      {
        orderId: 12,
        market: 'ZEC',
        type: 'LONG',
        qty: 10,
        filledQty: 0,
        margin: 500,
        orderType: 'limit',
        price: 1900,
        status: 'open',
        createdAt: new Date(),
      },
    ],
  },
]

export const orderbooks: Orderbooks = {
  SOL: { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01 },
  ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 },
}

export const fills: Fill[] = [
  {
    fillId: 1,
    maker: 1,
    taker: 2,
    market: 'SOL',
    qty: 10,
    price: 90,
    long: 1,
    short: 2,
    createdAt: new Date(),
  },
  {
    fillId: 2,
    maker: 1,
    taker: 2,
    market: 'ETH',
    qty: 1,
    price: 1900,
    long: 2,
    short: 1,
    createdAt: new Date(),
  },
]

export const sessions: Record<string, number> = {}
