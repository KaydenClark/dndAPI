const express = require('express');
const jwt = require('jsonwebtoken')
require('dotenv').config()
const router = express.Router();

const {validateUser} = require('../../DataAccess/users/login/login')

router.post('/', async(req, res) =>{
    let email = req.body.email
    let user = {email: email}
    let hash = req.body.hash
    let accessToken = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN)
    // console.log(await validateUser(userName, hash))
    if(await validateUser(email, hash)){
        // res.send(genToken())
        res.send(accessToken)
    } else {
        res.send(false)
    }
})

module.exports = router