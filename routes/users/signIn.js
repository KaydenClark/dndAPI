const express = require('express');
const jwt = require('jsonwebtoken');

const { validateUser } = require('../../DataAccess/users');
const { asyncHandler } = require('../../middleware/asyncHandler');
const { getJwtSecret } = require('../../middleware/authenticate');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string'
        ? req.body.password
        : req.body.hash;

    if (!email || !password) {
        res.status(400).json({
            error: 'Email and password are required'
        });
        return;
    }

    const user = await validateUser(email, password);

    if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
    }

    const token = jwt.sign(
        {
            email: user.email,
            userName: user.userName
        },
        getJwtSecret(),
        { expiresIn: '1h' }
    );

    res.json({ token });
}));

module.exports = router;
