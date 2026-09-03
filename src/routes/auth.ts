import type { Router } from 'express'
import express from 'express'
import { SignIn, SingUp } from '../controllers/auth'
import { Authenticate, Onramp } from './middleware'

const router: Router = express.Router()

router.post('/signup', SingUp)
router.post('/signin', SignIn)
router.post('/onramp-solana', Authenticate, Onramp)

export default router
