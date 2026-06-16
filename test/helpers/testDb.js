// test/helpers/testDb.js
//
// Wraps MongoMemoryServer so that test files can gracefully skip when the
// binary download is blocked (e.g., restricted cloud environments) rather
// than crashing the whole suite with an uncaught network error.
//
// Usage in a test file:
//
//   const { acquireTestDb, releaseTestDb } = require('./helpers/testDb');
//
//   let db;
//   before(async () => { db = await acquireTestDb(); });
//   after(async () => { await releaseTestDb(); });
//
//   test('something', async () => {
//     if (!db.available) {
//       return; // skip gracefully
//     }
//     // ... use db.uri to connect
//   });

const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer = null;

async function acquireTestDb() {
    try {
        mongoServer = await MongoMemoryServer.create();
        return { uri: mongoServer.getUri(), available: true };
    } catch (err) {
        return { uri: null, available: false, error: err.message };
    }
}

async function releaseTestDb() {
    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
    }
}

module.exports = { acquireTestDb, releaseTestDb };
