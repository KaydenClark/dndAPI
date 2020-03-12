const express = require('express');
const router = express.Router();

const {createUser} = require('../../DataAccess/users/signUp/createUser')
const {newUserCheck} = require('../../DataAccess/users/signUp/newUserCheck')

router.get('/', async (req, res) => {
    res.send("Wait a minute... Who ARE you?")
})

router.post('/', async (req, res) => {
    let userName = req.body.userName
    let email = req.body.email
    let hash = req.body.hash
    const validate = await newUserCheck(userName, email)
    if(validate){
        console.log("sign up failed, user exsists")
        // res.status(403)
        res.send(false)
    }else{
       const newUser = await createUser(userName, hash, email)
       res.send(newUser)
    }
})


module.exports = router