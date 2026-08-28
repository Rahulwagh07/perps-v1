import express from 'express';
import session from 'express-session';
import passport from 'passport';
import './config/passport';  // Import passport configuration
import authRoutes from './routes/auth';

const app = express();

app.use(express.json());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);

// Other routes...

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});