const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken')
require('dotenv').config()

// const {authenticate} = require('../../DataAccess/users/login/authenticate')
// const {readCharacters} = require('../../DataAccess/character/readCharacters')
const {readPlayersCharacters} = require('../../DataAccess/character/readPlayersCharacters')
const {createCharacter} = require('../../DataAccess/character/createCharacter')

const authenticate = (req, res, next) => {
    console.log('__________________NEW REQUEST_____________________________')
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if(token == null){
        return res.sendStatus(401)
    } else {
        jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, user) => {
            if(err) return res.sendStatus(403)
            req.user = user
            next()
        }) //JWT Verify the Token
    } // IF/ELSE
} // Auth

router.post('/', authenticate, async (req, res) => {
    const sheet = req.body
    const player = createCharacter(sheet)
    res.send(player)
})

router.get('/', authenticate, async (req, res) => {
    console.log(`${req.user.userName} conection request`)
    userName = req.user.userName
    characterList = await readPlayersCharacters(userName)
    res.send(characterList)
})

router.get('/:playerId', async (req, res) => {
    playerId = req.param.playerId
    playerData = getPlayerById(playerId)
    res.send(playerData)
})


module.exports = router