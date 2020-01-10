const express = require('express');
// const cors = require('cors')
const router = express.Router();

// router.use(cors())
router.use(express.json())

router.use('/login', require('./users/login'))
router.use('/signUp', require('./users/signUp'))


router.get('/test', (req, res) =>{
    res.send('Hello World')
})

module.exports = router