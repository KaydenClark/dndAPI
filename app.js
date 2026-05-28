require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { ensureIndexes } = require('./db/mongo');

function buildCorsOptions() {
    const allowedOrigins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (allowedOrigins.length === 0) {
        return {};
    }

    const allowedOriginSet = new Set(allowedOrigins);

    return {
        origin(origin, callback) {
            if (!origin || allowedOriginSet.has(origin)) {
                callback(null, true);
                return;
            }

            callback(null, false);
        }
    };
}

async function createApp() {
    await ensureIndexes();

    const app = express();

    app.use(cors(buildCorsOptions()));
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

module.exports = { buildCorsOptions, createApp };
