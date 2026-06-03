export type PositionType = 'LONG' | 'SHORT'
export type OrderType = 'limit' | 'market'

export type OrderStatus = 'filled' | 'open' | 'partial' | 'cancelled' | 'closed'

export type Position = {
  market: string
  type: PositionType
  qty: number
  margin: number
  liquidationPrice: number
  averagePrice: number
  pnL?: number
  status?: OrderStatus
}

export type Order = {
  orderId: number
  market: string
  type: PositionType
  qty: number
  filledQty: number
  margin: number
  orderType: OrderType
  price: number
  status: OrderStatus
  createdAt: Date
}

export type User = {
  userId: number
  username: string
  password: string
  collateral: { available: number; locked: number }
  positions: Position[]
  orders: Order[]
}

export type OpenOrderEntry = {
  userId: number
  qty: number
  filledQty: number
  orderId: number
  createdAt: Date
}

export type PriceLevel = {
  availableQty: number
  openOrders: OpenOrderEntry[]
}
export type Orderbook = {
  bids: Record<string, PriceLevel>
  asks: Record<string, PriceLevel>
  lastTradedPrice: number
  indexPrice: number
}

export type Orderbooks = Record<string, Orderbook>

export type Fill = {
  fillId: number
  maker: number
  taker: number
  market: string
  qty: number
  price: number
  long: number
  short: number
  createdAt: Date
}
