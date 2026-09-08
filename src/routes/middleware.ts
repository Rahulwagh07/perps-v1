import type { NextFunction } from 'express'
import type { Request, Response } from 'express'
import { getUserFromRequest } from '../utils/auth'

export function Authenticate(req: Request, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  req.userId = user.userId
  next()
}
