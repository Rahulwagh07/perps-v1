import type { Request } from 'express'
import { sessions, users } from '../store'

export function getUserFromRequest(req: Request) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return
  const userId = sessions[token]
  return users.find(u => u.userId === userId)
}

export function GenerateToken() {
  return Math.random().toString(12) + Date.now().toString(36)
}
