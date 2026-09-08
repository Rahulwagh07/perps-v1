import type { Router } from 'express'
import express from 'express'
import { Onramp } from '../controllers/onramp'
import { Authenticate } from './middleware'

const router: Router = express.Router()

router.post('/v1/onramp', Authenticate, Onramp)

export default router
