import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import { users, sessions } from '../store';
import { User } from '../types';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    const existingUser = users.find(u => u.username === profile.emails[0].value);
    if (existingUser) {
        return done(null, existingUser);
    }
    const newUser: User = {
        userId: users.length + 1,
        username: profile.emails[0].value,
        password: '', // Handle Google login without password
        collateral: { available: 0, locked: 0 },
        positions: [],
        orders: [],
    };
    users.push(newUser);
    done(null, newUser);
}));

passport.serializeUser((user: User, done) => {
    done(null, user.userId);
});

passport.deserializeUser((userId: number, done) => {
    const user = users.find(u => u.userId === userId);
    done(null, user);
});