import { Router } from 'express'
import { Authenticate } from './middleware'
import {
  GetAllOrders,
  GetClosedPositions,
  GetEquity,
  GetFills,
  GetOpenOrders,
  GetOpenPositions,
} from '../controllers/account'

const router = Router()

router.get('/equity/available', Authenticate, GetEquity)
router.get('/positions/open/:marketId', Authenticate, GetOpenPositions)
router.get('/positions/closed/:marketId', Authenticate, GetClosedPositions)
router.get('/orders/open/:marketId', Authenticate, GetOpenOrders)
router.get('/orders/:marketId', Authenticate, GetAllOrders)
router.get('/fills', GetFills)

export default router
