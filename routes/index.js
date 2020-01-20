const express = require('express');
const cors = require('cors')
const router = express.Router();

router.use(cors())
router.use(express.json())

router.use('/signIn', require('./users/signIn'))
router.use('/signUp', require('./users/signUp'))
router.use('/player', require('./character/character'))


router.get('/test', (req, res) =>{
    res.send('Hello World')
})

module.exports = router