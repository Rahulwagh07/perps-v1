import { orderbooks } from '../store'
import type { Position, User } from '../types'

export function calEquity(user: User) {
  const totalCollateral = user.collateral.available + user.collateral.locked

  const unrealizedPnl = user.positions.reduce((sum, pos) => {
    const ob = orderbooks[pos.market]
    return ob ? sum + calPnl(pos, ob.lastTradedPrice) : sum + (pos.pnL ?? 0)
  }, 0)

  return totalCollateral + unrealizedPnl
}

export function calPnl(position: Position, markPrice: number) {
  const diff = markPrice - position.averagePrice
  return position.type === 'LONG' ? diff * position.qty : -diff * position.qty
}
