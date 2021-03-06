const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken')
require('dotenv').config()

// const {authenticate} = require('../../DataAccess/users/login/authenticate')
// const {readCharacters} = require('../../DataAccess/character/readCharacters')
const {readPlayersCharacters} = require('../../DataAccess/character/readPlayersCharacters')
const {createCharacter} = require('../../DataAccess/character/createCharacter')
const {getCharacterById} = require('../../DataAccess/character/getCharacterById')

const authenticate = (req, res, next) => {
    console.log('__________________NEW REQUEST_____________________________')
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if(token == null){
        return res.sendStatus(401)
    } else {
        jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, user) => {
            if(err) {
                return res.sendStatus(403)
            } else {
            req.user = user
            next()
            }
        }) //JWT Verify the Token
    } // IF/ELSE
} // Auth

router.post('/', authenticate, async (req, res) => {
    const sheet = req.body
    const player = createCharacter(sheet)
    res.send(player)
})

router.get('/', authenticate, async (req, res) => {
    console.log(`${req.user.email} conection request`)
    email = req.user.email
    characterList = await readPlayersCharacters(email)
    res.send(characterList)
})

router.get('/:characterId', async (req, res) => {
    characterId = req.param.characterId
    characterData = await getCharacterById(characterId)
    console.log(characterData)
    res.send(characterData)
})


module.exports = router