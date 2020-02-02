const express = require('express');
const cors = require('cors')
const router = express.Router();

router.use(cors())
router.use(express.json())

const {testConnection} = require('../DataAccessLayer/testConnection')

router.use('/signIn', require('./users/signIn'))
router.use('/signUp', require('./users/signUp'))
router.use('/player', require('./character/character'))

router.get('/', async (req, res) => {
    const connection = await testConnection()
    res.send(connection)
})

module.exports = router