import type { NextFunction } from 'express'
import type { Request, Response } from 'express'
import { getUserFromRequest } from '../utils/auth'
import { users } from '../store'

export function Authenticate(req: Request, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  req.userId = user.userId
  next()
}

export function Onramp(req: Request, res: Response) {
  const userId = req.userId
  const { amount } = req.body

  if (!amount || amount < 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' })
  }

  const user = users.find(u => u.userId === userId)

  if (!user) {
    return res.status(400).json({ error: 'User not found' })
  }

  user.collateral.available += amount
  return res.status(200).json({ collateral: user.collateral })
}
