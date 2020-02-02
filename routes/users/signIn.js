const express = require('express');
const router = express.Router();

const {validateUser} = require('../../DataAccess/users/login/login')
const {genToken} = require('../../DataAccess/users/login/genToken')

router.post('/', async(req, res) =>{
    let userName = req.body.userName
    let hash = req.body.hash
    // console.log(await validateUser(userName, hash))
    if(await validateUser(userName, hash)){
        // res.send(genToken())
        res.send(true)
    } else {
        res.send(false)
    }
})

module.exports = router