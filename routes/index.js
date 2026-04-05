const express = require('express');

const { pingDb } = require('../db/mongo');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.use('/signIn', require('./users/signIn'))
router.use('/signUp', require('./users/signUp'))
router.use('/compendium', require('./compendium'))
router.use('/player', require('./character/character'))

router.get('/', asyncHandler(async (req, res) => {
    await pingDb();
    res.json({ status: 'ok' });
}));

module.exports = router;
