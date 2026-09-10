import type { Router } from 'express'
import express from 'express'
import { SignIn, SingUp } from '../controllers/auth'
import { Authenticate, OnrampUsd } from './middleware'

const router: Router = express.Router()

router.post('/signup', SingUp)
router.post('/signin', SignIn)
router.post('/onramp-usd', Authenticate, OnrampUsd)

export default router
