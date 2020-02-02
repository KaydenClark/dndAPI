const express = require('express')
const router = express.Router()

const {createCharacter} = require('../../DataAccess/character/createCharacter')

router.get('/', (req, res) => {

    res.send('hello')
})

router.post('/', async (req, res) => {
    playerData = req.body
    player = await createCharacter(playerData)
    res.send('hello')
})

module.exports = router