import { orderbooks } from '../store'
import type { PositionType, User } from '../types'
import { calPnl } from './pnl'

export function applyPositionFill(
  user: User,
  market: string,
  side: PositionType,
  qty: number,
  price: number,
  marginUsed: number
) {
  const ob = orderbooks[market]

  const opposingSide = side === 'LONG' ? 'SHORT' : 'LONG'

  const opposingPos = user.positions.find(
    p => p.market === market && p.type === opposingSide && p.status !== 'closed'
  )

  //closing / reducing existing positions
  if (opposingPos) {
    //full close
    if (qty >= opposingPos.qty) {
      const closedQty = opposingPos.qty

      const realizedPnl = calPnl({ ...opposingPos, qty: closedQty }, price)

      const marginToReturn = (closedQty / opposingPos.qty) * opposingPos.margin

      opposingPos.status = 'closed'
      opposingPos.pnL = realizedPnl

      user.collateral.locked = Math.max(
        0,
        user.collateral.locked - marginToReturn
      )

      user.collateral.available += marginToReturn + realizedPnl

      const remaining = qty - closedQty

      // position flip
      if (remaining > 0) {
        const remainingMargin = marginUsed * (remaining / qty)

        openNewPosition(user, market, side, remaining, price, remainingMargin)
      }

      return
    }

    // partial close
    const realizedPnl = calPnl({ ...opposingPos, qty }, price)

    const marginToReturn = (qty / opposingPos.qty) * opposingPos.margin

    opposingPos.qty -= qty
    opposingPos.margin -= marginToReturn

    user.collateral.locked = Math.max(
      0,
      user.collateral.locked - marginToReturn
    )

    user.collateral.available += marginToReturn + realizedPnl

    opposingPos.pnL = (opposingPos.pnL ?? 0) + realizedPnl

    return
  }

  const existingPos = user.positions.find(
    p => p.market === market && p.type === side && p.status !== 'closed'
  )

  if (existingPos) {
    const totalQty = existingPos.qty + qty
    existingPos.averagePrice =
      (existingPos.averagePrice * existingPos.qty + price * qty) / totalQty
    existingPos.qty = totalQty
    existingPos.margin += marginUsed
    existingPos.liquidationPrice =
      side === 'LONG'
        ? existingPos.averagePrice * 0.8
        : existingPos.averagePrice * 1.2
  } else {
    openNewPosition(user, market, side, qty, price, marginUsed)
  }
  if (ob) {
    ob.lastTradedPrice = price
  }
}

export function openNewPosition(
  user: User,
  market: string,
  side: PositionType,
  qty: number,
  price: number,
  margin: number
) {
  user.positions.push({
    market,
    type: side,
    qty,
    margin,
    averagePrice: price,
    liquidationPrice: side === 'LONG' ? price * 0.8 : price * 1.2,
    status: 'open',
    pnL: 0,
  })
}
