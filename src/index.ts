import express from 'express'
import authRoutes from './routes/auth'
import orderRoutes from './routes/order'
import accountRoutes from './routes/account'

export const app = express()
app.use(express.json())

const PORT = process.env.PORT ?? 3000

app.use(authRoutes)
app.use(orderRoutes)
app.use(accountRoutes)

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log('app is running on port', PORT))
}
