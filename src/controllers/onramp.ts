import type { Request, Response } from 'express'
import { users } from '../store'

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
