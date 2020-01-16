const express = require('express');
const router = express.Router();

const {createUser} = require('../../DataAccessLayer/users/signUp/createUser')
const {newUserCheck} = require('../../DataAccessLayer/users/signUp/newUserCheck')

router.get('/', async (req, res) => {
    res.send("Wait a minute... Who ARE you?")
})

router.post('/', async (req, res) => {
    let userName = req.body.userName
    let hash = req.body.hash
    const validate = await newUserCheck(userName)
    if(validate){
        res.send('user exsists')
    }else{
       const newUser = await createUser(userName, hash)
       res.send(newUser)
    }
})


module.exports = router