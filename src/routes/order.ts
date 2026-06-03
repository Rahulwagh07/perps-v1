import type { Router } from 'express'
import express from 'express'
import { CancelOrder, PlaceOrder } from '../controllers/order'
import { Authenticate } from './middleware'

const router: Router = express.Router()

router.post('/order', Authenticate, PlaceOrder)
router.delete('/order', Authenticate, CancelOrder)

export default router
