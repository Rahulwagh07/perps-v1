import type { Router } from 'express'
import express from 'express'
import { SignIn, SingUp } from '../controllers/auth'
import { Authenticate } from './middleware'

const router: Router = express.Router()

router.post('/v1/signup', SingUp)
router.post('/v1/signin', SignIn)

export default router
