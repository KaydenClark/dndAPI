const express = require('express');

const { getBootstrapCompendium } = require('../DataAccess/compendium');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.get('/bootstrap', asyncHandler(async (req, res) => {
    const compendium = await getBootstrapCompendium();
    res.json(compendium);
}));

module.exports = router;
