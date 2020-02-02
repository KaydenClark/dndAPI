const express = require('express');
const router = express.Router();

const {readCharacters} = require('../../DataAccess/character/readCharacters')
const {createCharacter} = require('../../DataAccess/character/createCharacter')

router.post('/', async (req, res) => {
    const sheet = req.body
    const player = createCharacter(sheet)
    res.send(player)
})

router.get('/allPlayerData', async (req, res) => {
    characterList = await readCharacters()
    res.send(characterList)
})

router.get('/:playerId', async (req, res) => {
    playerId = req.param.playerId
    playerData = getPlayerById(playerId)
    res.send(playerData)
})

module.exports = router