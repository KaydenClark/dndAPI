const jwt = require('jsonwebtoken');

function getJwtSecret() {
    if (!process.env.ACCESS_SECRET_TOKEN) {
        const error = new Error('ACCESS_SECRET_TOKEN is required');
        error.statusCode = 500;
        throw error;
    }

    return process.env.ACCESS_SECRET_TOKEN;
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : undefined;

    if (!token) {
        res.status(401).json({ error: 'Authorization token is required' });
        return;
    }

    jwt.verify(token, getJwtSecret(), (error, user) => {
        if (error) {
            res.status(403).json({ error: 'Authorization token is invalid' });
            return;
        }

        req.user = user;
        next();
    });
}

module.exports = {
    authenticate,
    getJwtSecret
};
