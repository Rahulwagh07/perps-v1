import type { User, Orderbooks, Fill } from './types'

export let nextUserId = 1
export let nextOrderId = 1
export let nextFillId = 1

export const incrementUserId = () => nextUserId++
export const incrementOrderId = () => nextOrderId++
export const incrementFillId = () => nextFillId++

export const users: User[] = []

export const orderbooks: Orderbooks = {
  SOL: { bids: {}, asks: {}, lastTradedPrice: 131, indexPrice: 131 },
  ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 },
  USDC: { bids: {}, asks: {}, lastTradedPrice: 0, indexPrice: 0 },
}

export const fills: Fill[] = []

export const sessions: Record<string, number> = {}