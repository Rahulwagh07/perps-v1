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

router.get('/v1/equity/available', Authenticate, GetEquity)
router.get('/v1/positions/open/:marketId', Authenticate, GetOpenPositions)
router.get('/v1/positions/closed/:marketId', Authenticate, GetClosedPositions)
router.get('/v1/orders/open/:marketId', Authenticate, GetOpenOrders)
router.get('/v1/orders/:marketId', Authenticate, GetAllOrders)
router.get('/v1/fills', GetFills)

export default router
