import express from 'express'
import authRoutes from './routes/auth'
import orderRoutes from './routes/order'
import accountRoutes from './routes/account'
import onrampRoutes from './routes/onramp'

const app = express()
app.use(express.json())

const PORT = 3000

app.use(authRoutes)
app.use(onrampRoutes)
app.use(orderRoutes)
app.use(accountRoutes)

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log('app is running on port', PORT))
}

export { app }
