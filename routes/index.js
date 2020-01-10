const express = require('express');
// const cors = require('cors')
const router = express.Router();

// router.use(cors())
router.use(express.json())

router.use('/login', require('./users/login'))
// router.use('/signUp', require('./users/signUp'))

router.post('/signup', (req, res) => {
    let userName = req.body.userName
    console.log(req.body)
    res.send(userName)
    // console.log(req)
    // if(newUserCheck(req.body)){
    //     res.send('user exsists')
    // }else{
    //     createUser(req.body.name, req.body.hash)
    // }

})

router.get('/test', (req, res) =>{
    res.send('Hello World')
})

module.exports = router