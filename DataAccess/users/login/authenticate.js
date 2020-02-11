const jwt = require('jsonwebtoken')
require('dotenv').config()
const express = require('express')

const authenticate = (req, res, next) => {
    console.log('__________________NEW REQUEST_____________________________')
    const authHeader = req.headers['Authorization']
    const token = authHeader && authHeader.split(' ')[1]
    console.log(authHeader)
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