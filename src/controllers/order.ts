import type { Request, Response } from 'express'
import { incrementOrderId, orderbooks, users } from '../store'
import type { Order } from '../types'
import { matchOrder } from '../engine'

export function PlaceOrder(req: Request, res: Response) {
  const userId = req.userId

  const { market, type, qty, orderType, price, margin } = req.body

  if (!market || !type || !qty || !orderType || !margin) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!['LONG', 'SHORT'].includes(type)) {
    res.status(400).json({ error: 'type must be LONG or SHORT' })
    return
  }

  if (!['limit', 'market'].includes(orderType)) {
    res.status(400).json({ error: 'orderType must be limit or market' })
    return
  }

  const ob = orderbooks[market]

  const effectivePrice =
    orderType === 'market' ? (ob?.lastTradedPrice ?? price ?? 0) : price

  if (!effectivePrice) {
    return res.status(400).json({ error: 'price is req for limit orders' })
  }

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }

  if (user?.collateral.available < margin) {
    return res.status(400).json({ error: 'insufficient balance' })
  }

  user.collateral.available -= margin
  user.collateral.locked += margin

  const orderId = incrementOrderId()

  const newOrder: Order = {
    orderId,
    market,
    type,
    qty,
    filledQty: 0,
    margin,
    orderType,
    price: effectivePrice,
    status: 'open',
    createdAt: new Date(),
  }

  user.orders.push(newOrder)

  if (!orderbooks[market]) {
    orderbooks[market] = {
      bids: {},
      asks: {},
      lastTradedPrice: effectivePrice,
      indexPrice: effectivePrice,
    }
  }

  const side =
    type === 'LONG' ? orderbooks[market].bids : orderbooks[market].asks

  const priceStr = effectivePrice.toString()

  if (!side[priceStr]) {
    side[priceStr] = {
      availableQty: 0,
      openOrders: [],
    }
  }

  side[priceStr].availableQty += qty
  side[priceStr].openOrders.push({
    userId: user.userId,
    qty,
    filledQty: 0,
    orderId,
    createdAt: new Date(),
  })

  matchOrder(orderId, market)

  const updateOrder = user.orders.find((o: Order) => o.orderId === orderId)

  return res.status(201).json({
    orderId,
    status: updateOrder?.status,
    filledQty: updateOrder?.filledQty,
    price: effectivePrice,
  })
}

export function CancelOrder(req: Request, res: Response) {
  const userId = req.userId

  const { orderId } = req.body

  if (!orderId) {
    return res.status(400).json({ error: 'Orderid is required' })
  }

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'user not found' })
  }

  const order = user.orders.find(o => o.orderId === orderId)

  if (!order) {
    return res.status(400).json({ error: 'Order not found' })
  }

  if (order.status !== 'open' && order.status !== 'partial') {
    return res.status(400).json({
      error: `Can not cancel the order with current status: ${order.status}`,
    })
  }

  const unfilledQty = order.qty - order.filledQty
  const marginPerUnit = order.margin / order.qty
  const marginToReturn = marginPerUnit * unfilledQty

  order.status = 'cancelled'

  user.collateral.locked = Math.max(0, user.collateral.locked - marginToReturn)

  user.collateral.available += marginToReturn

  const ob = orderbooks[order.market]

  if (ob) {
    const side = order.type === 'LONG' ? ob.bids : ob.asks
    const priceStr = order.price.toString()

    if (side[priceStr]) {
      //remove order
      side[priceStr].openOrders = side[priceStr].openOrders.filter(
        e => e.orderId !== orderId
      )

      //cal remaining quantity at the price
      side[priceStr].availableQty = side[priceStr].openOrders.reduce(
        (sum, e) => sum + (e.qty - e.filledQty),
        0
      )

      //delete price level
      if (side[priceStr].openOrders.length === 0) {
        delete side[priceStr]
      }
    }
  }

  return res.status(200).json({
    message: 'order cancelled',
    marginToReturned: marginToReturn,
  })
}
