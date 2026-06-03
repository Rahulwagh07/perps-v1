import express from 'express'
import authRoutes from './routes/auth'
import orderRoutes from './routes/order'
import accountRoutes from './routes/account'

const app = express()
app.use(express.json())

const PORT = 3000

app.use(authRoutes)
app.use(orderRoutes)
app.use(accountRoutes)
app.listen(PORT, () => console.log('app is running on port', PORT))
