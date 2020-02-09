const jwt = require('jsonwebtoken')
require('dotenv').config()

const authenticate = (req, res, nex) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if(token == null){
        return res.sendStatus(401)
    } else {
        jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, user) => {
            if(err) return res.sendStatus(403)
            req.user = user
            next()
        }) //JWT Verify the Token
    } // IF/ELSE
} // Auth

module.exports = {authenticate}