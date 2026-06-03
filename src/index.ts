import express from 'express'
import authRoutes from './routes/auth'

const app = express()
app.use(express.json())

const PORT = 3000

app.use(authRoutes)
app.listen(PORT, () => console.log('app is running on port', PORT))
