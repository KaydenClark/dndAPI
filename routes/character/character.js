const express = require('express');
const router = express.Router();

const {readCharacters} = require('../../DataAccessLayer/character/readCharacters')
const {createCharacter} = require('../../DataAccessLayer/character/createCharacter')

router.get('/', async (req, res) => {
    res.send("playerData")
})

router.get('/allPlayerData', async (req, res) => {
    characterList = await readCharacters()
    res.send(characterList)
})

router.post('/', async (req, res) => {
    const sheet = req.body
    const player = createCharacter(sheet)
    res.send(player)
})

module.exports = router