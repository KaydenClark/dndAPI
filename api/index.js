const { createApp } = require('../app');

const appPromise = createApp();

module.exports = async function handler(req, res) {
    const app = await appPromise;
    return app(req, res);
};
