const express = require('express');
const router = express.Router();

const {validateUser} = require('../../DataAccessLayer/users/login/login')
const {genToken} = require('../../DataAccessLayer/users/login/genToken')

router.post('/', async(req, res) =>{
    let userName = req.body.userName
    let hash = req.body.hash
    // console.log(await validateUser(userName, hash))
    if(await validateUser(userName, hash)){
        // res.send(genToken())
    } else {
        res.send('User Name or Password do not match')
    }
})

module.exports = router