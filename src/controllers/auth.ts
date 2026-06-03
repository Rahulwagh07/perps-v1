import type { Request, Response } from 'express'
import { incrementUserId, sessions, users } from '../store'
import type { User } from '../types'
import { GenerateToken } from '../utils/auth'

export function SingUp(req: Request, res: Response) {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' })
  }

  const user = users.find(u => u.username === username)
  if (user) {
    return res.status(409).json({ error: 'username is already taken' })
  }

  const newUser: User = {
    userId: incrementUserId(),
    username,
    password,
    collateral: { available: 0, locked: 0 },
    positions: [],
    orders: [],
  }

  users.push(newUser)
  return res.status(200).json({
    userId: newUser.userId,
    username: newUser.username,
  })
}

export function SignIn(req: Request, res: Response) {
  const { username, password } = req.body

  const user = users.find(
    u => u.username === username && u.password === password
  )

  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  const token = GenerateToken()

  sessions[token] = user.userId

  return res.status(200).json({ token })
}
