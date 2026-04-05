require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { ensureIndexes } = require('./db/mongo');

async function createApp() {
    await ensureIndexes();

    const app = express();

    app.use(cors());
    app.use(express.json());

    app.use(require('./routes'));

    app.use((req, res) => {
        res.status(404).json({ error: 'Unknown request' });
    });

    app.use((error, req, res, next) => {
        if (res.headersSent) {
            next(error);
            return;
        }

        console.error(error);

        const statusCode = error.statusCode || 500;
        const payload = { error: error.message || 'Internal server error' };

        if (error.details) {
            payload.details = error.details;
        }

        res.status(statusCode).json(payload);
    });

    return app;
}

module.exports = { createApp };
