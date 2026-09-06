import express from 'express'
import authRoutes from './routes/auth'
import orderRoutes from './routes/order'
import accountRoutes from './routes/account'

const app = express()
app.use(express.json())

app.use(authRoutes)
app.use(orderRoutes)
app.use(accountRoutes)

export default app
