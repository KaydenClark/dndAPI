const jwt = require('jsonwebtoken')

const jsonToken = () => {
    jwt.sign({
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
        data: "MilkMan"
    }, 'secret', )
}

module.exports = {jsonToken}