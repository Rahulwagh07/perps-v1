import type { Request, Response } from 'express'
import { fills, users } from '../store'
import { calEquity } from '../utils/pnl'

export function GetEquity(req: Request, res: Response) {
  const userId = req.userId

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }

  const equity = calEquity(user)
  return res.json({
    totalEquity: equity,
  })
}

export function GetOpenPositions(req: Request, res: Response) {
  const userId = req.userId

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }
  const { marketId } = req.params

  const positions = user.positions.filter(
    p => p.market === marketId && p.status !== 'closed'
  )

  return res.status(200).json({
    positions,
  })
}

export function GetClosedPositions(req: Request, res: Response) {
  const userId = req.userId

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }

  const { marketId } = req.params

  const positions = user.positions.filter(
    p => p.market === marketId && p.status === 'closed'
  )

  return res.status(200).json({
    positions,
  })
}

export function GetOpenOrders(req: Request, res: Response) {
  const userId = req.userId

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }
  const { marketId } = req.params

  const openOrders = user.orders.filter(o => {
    return (
      o.market === marketId && (o.status === 'open' || o.status === 'partial')
    )
  })
  return res.status(200).json({
    openOrders,
  })
}

export function GetAllOrders(req: Request, res: Response) {
  const userId = req.userId

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }

  const { marketId } = req.params

  const orders = user.orders.filter(o => o.market === marketId)

  return res.status(200).json({
    orders,
  })
}

export function GetFills(req: Request, res: Response) {
  const { market } = req.query

  return res
    .status(200)
    .json(market ? fills.filter(f => f.market === market) : fills)
}
