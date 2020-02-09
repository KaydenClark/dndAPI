const express = require('express');
const jwt = require('jsonwebtoken')
require('dotenv').config()
const router = express.Router();

const {validateUser} = require('../../DataAccess/users/login/login')

router.post('/', async(req, res) =>{
    let userName = req.body.userName
    let user = {userName: userName}
    let hash = req.body.hash
    let accessToken = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN)
    // console.log(await validateUser(userName, hash))
    if(await validateUser(userName, hash)){
        // res.send(genToken())
        res.send(accessToken)
    } else {
        res.send(false)
    }
})

module.exports = router