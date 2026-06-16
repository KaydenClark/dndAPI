const express = require('express');

const { createUser, findExistingUser } = require('../../DataAccess/users');
const { asyncHandler } = require('../../middleware/asyncHandler');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const userName = typeof req.body.userName === 'string' ? req.body.userName.trim() : '';
    const password = typeof req.body.password === 'string'
        ? req.body.password
        : req.body.hash;

    if (!email || !userName || !password) {
        res.status(400).json({
            error: 'Email, userName, and password are required'
        });
        return;
    }

    const existingUser = await findExistingUser({ email, userName });

    if (existingUser) {
        const duplicateField = existingUser.email === email ? 'email' : 'userName';

        res.status(409).json({
            error: `${duplicateField} already exists`
        });
        return;
    }

    const user = await createUser({ email, userName, password });

    res.status(201).json({ user });
}));

module.exports = router;
