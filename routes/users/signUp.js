const express = require('express');
const router = express.Router();

const createUser = require('../../DataAccessLayer/users/signUp/createUser')
const newUserCheck = require('../../DataAccessLayer/users/signUp/newUserCheck')

router.post('/', (req, res) => {
    let userName = req.body
    console.log(userName)
    // res.send(userName)
    // console.log(req)
    // if(newUserCheck(req.body)){
    //     res.send('user exsists')
    // }else{
        // createUser(req.body.userName, req.body.hash)
    // }

})


module.exports = router