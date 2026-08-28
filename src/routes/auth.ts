import type { Router } from 'express'
import express from 'express'
import { SignIn, SingUp, GoogleSignIn } from '../controllers/auth'
import { Authenticate, Onramp } from './middleware'

const router: Router = express.Router()

router.post('/signup', SingUp)
router.post('/signin', SignIn)
router.post('/google-signin', GoogleSignIn)
router.post('/onramp', Authenticate, Onramp)

export default router