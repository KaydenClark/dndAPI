const express = require('express');
const router = express.Router();

const {createCharacter} = require('../../DataAccessLayer/character/createCharacter')

router.get('/', async (req, res) => {
    res.send('Characters API')
})

router.post('/', async (req, res) => {
    const sheet = req.body
    const player = createCharacter(sheet)
    res.send(player)
})

module.exports = router