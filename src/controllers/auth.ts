import type { Request, Response } from 'express';
import { incrementUserId, sessions, users } from '../store';
import type { User } from '../types';
import { GenerateToken } from '../utils/auth';

export function SingUp(req: Request, res: Response) {
  // Existing signup logic...
}

export function SignIn(req: Request, res: Response) {
  // Existing sign-in logic...
}

export function GoogleAuth(req: Request, res: Response) {
    const user = req.user;
    const token = GenerateToken();
    sessions[token] = user.userId;
    return res.status(200).json({ token });
}