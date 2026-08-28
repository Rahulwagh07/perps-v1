import type { Router } from 'express';
import express from 'express';
import { SignIn, SingUp } from '../controllers/auth';
import { Authenticate, Onramp } from './middleware';

import passport from 'passport';

const router: Router = express.Router();

router.post('/signup', SingUp);
router.post('/signin', SignIn);
router.post('/onramp', Authenticate, Onramp);

// Google Auth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    // Successful authentication, redirect home.
    res.redirect('/');
});

export default router;