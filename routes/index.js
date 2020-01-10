const express = require('express');
const cors = require('cors')
const router = express.Router();

router.use(cors())
router.use(express.json())

router.use('/lists', require('./lists/listsAPI'))

router.get('/test', (req, res) =>{
    res.send('Hello World')
})

module.exports = router