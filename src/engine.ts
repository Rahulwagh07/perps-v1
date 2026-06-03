import { fills, incrementFillId, orderbooks, users } from './store'
import { applyPositionFill } from './utils/position'

export function matchOrder(inComingOrderId: number, market: string) {
  const ob = orderbooks[market]

  if (!ob) return

  let inComingUser
  let incomingOrder
  for (const user of users) {
    const order = user.orders.find(o => o.orderId === inComingOrderId)
    if (order) {
      inComingUser = user
      incomingOrder = order
      break
    }
  }

  //find user and order
  if (!inComingUser || !incomingOrder) return
  if (incomingOrder.status === 'cancelled') return

  const isBuy = incomingOrder.type === 'LONG'

  const oppositeSide = isBuy ? ob.asks : ob.bids

  const priceLevels = Object.keys(oppositeSide)

  const prices = priceLevels.map(price => Number(price))

  if (isBuy) {
    prices.sort((a, b) => a - b) // lowest to highest
  } else {
    prices.sort((a, b) => b - a) // highest to lowest
  }

  const sortedPriceLevels = prices

  //loop through all matching price levels
  for (const levelPrice of sortedPriceLevels) {
    //stop if incoming order is completely filled
    if (incomingOrder.qty - incomingOrder.filledQty === 0) break

    if (incomingOrder.orderType === 'limit') {
      if (isBuy && levelPrice > incomingOrder.price) break
      if (!isBuy && levelPrice < incomingOrder.price) break
    }

    const priceStr = levelPrice.toString()

    const level = oppositeSide[priceStr]

    //skip empty levels
    if (!level || level.openOrders.length === 0) continue

    //all resting orders at this price
    for (const restingEntry of [...level.openOrders]) {
      if (incomingOrder.qty - incomingOrder.filledQty === 0) break

      //resting order owner
      const restingUser = users.find(u => u.userId === restingEntry.userId)

      const restingOrder = restingUser?.orders.find(
        o => o.orderId === restingEntry.orderId
      )

      if (!restingOrder || !restingUser) continue

      //remove cancelled resting order
      if (restingOrder.status === 'cancelled') {
        level.openOrders = level.openOrders.filter(
          e => e.orderId !== restingEntry.orderId
        )
        continue
      }

      //rem qty of the incoming order
      const incomingRemaining = incomingOrder.qty - incomingOrder.filledQty
      //rem qty of the resting order
      const restingRemaining = restingEntry.qty - restingEntry.filledQty

      //match smaller qty
      const matchQty = Math.min(incomingRemaining, restingRemaining)

      //trade execute resting order price
      const matchPrice = levelPrice

      incomingOrder.filledQty += matchQty
      restingEntry.filledQty += matchQty
      restingOrder.filledQty += matchQty

      //reduce availableqty at price level
      level.availableQty = Math.max(0, level.availableQty - matchQty)

      const longUserId = isBuy ? inComingUser.userId : restingUser.userId
      const shortUserid = isBuy ? restingUser.userId : inComingUser.userId

      fills.push({
        fillId: incrementFillId(),
        maker: restingUser.userId,
        taker: inComingUser.userId,
        market,
        qty: matchQty,
        price: matchPrice,
        long: longUserId,
        short: shortUserid,
        createdAt: new Date(),
      })

      ob.lastTradedPrice = matchPrice

      //margin used for this fill
      const incomingMarginPerUnit = incomingOrder.margin / incomingOrder.qty
      const incomingMarginUsed = incomingMarginPerUnit * matchQty

      //unlock used margin
      inComingUser.collateral.locked = Math.max(
        0,
        inComingUser.collateral.locked - incomingMarginUsed
      )

      //margin used for this fill- for resting order
      const restingMarginPerUnit = restingOrder.margin / restingOrder.qty
      const restingMarginUsed = restingMarginPerUnit * matchQty
      restingUser.collateral.locked = Math.max(
        0,
        restingUser.collateral.locked - restingMarginUsed
      )

      //update incoming user position
      applyPositionFill(
        inComingUser,
        market,
        incomingOrder.type,
        matchQty,
        matchPrice,
        incomingMarginUsed
      )

      //update resting user position
      applyPositionFill(
        restingUser,
        market,
        restingOrder.type,
        matchQty,
        matchPrice,
        restingMarginUsed
      )

      //check if resting order completely filled
      if (restingOrder.filledQty >= restingEntry.qty) {
        restingOrder.status = 'filled'
        level.openOrders = level.openOrders.filter(
          e => e.orderId !== restingEntry.orderId
        )
      }
    }

    if (level.openOrders.length === 0) {
      delete oppositeSide[priceStr]
    }
  }

  //incoming order completely filled
  if (incomingOrder.filledQty >= incomingOrder.qty) {
    incomingOrder.status = 'filled'
    const ownSide = isBuy ? ob.bids : ob.asks

    const priceStr = incomingOrder.price.toString()

    if (ownSide[priceStr]) {
      ownSide[priceStr].openOrders = ownSide[priceStr].openOrders.filter(
        e => e.orderId !== inComingOrderId
      )

      //re-calculate available quantity
      ownSide[priceStr].availableQty = ownSide[priceStr].openOrders.reduce(
        (sum, e) => sum + (e.qty - e.filledQty),
        0
      )

      if (ownSide[priceStr].openOrders.length === 0) {
        delete ownSide[priceStr]
      }
    }

    //partially filled
  } else if (incomingOrder.filledQty > 0) {
    incomingOrder.status = 'partial'
  }
}
