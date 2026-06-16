require('dotenv').config();

const { createApp } = require('./app');

const port = process.env.PORT || 5000;

createApp()
    .then((app) => {
        app.listen(port, () => {
            console.log(`Express listening on port ${port}`);
        });
    })
    .catch((error) => {
        console.error('Failed to start API', error);
        process.exit(1);
    });
