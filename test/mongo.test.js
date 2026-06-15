// Unit tests for the MongoDB connection layer (db/mongo.js).
// Each test runs in its own worker thread so module-level cached state is
// isolated from other test files.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { closeMongoConnection, ensureIndexes, getDb, pingDb } = require('../db/mongo');

let mongoServer;

test.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.ATLAS_CONNECTION = mongoServer.getUri();
    process.env.DB_NAME = 'MongoTestDb';
    await ensureIndexes();
});

test.after(async () => {
    await closeMongoConnection();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

test('getDb returns a database that can list its collections', async () => {
    const db = await getDb();
    const collections = await db.listCollections().toArray();
    assert.ok(Array.isArray(collections));
});

test('pingDb resolves without error when MongoDB is reachable', async () => {
    await assert.doesNotReject(() => pingDb());
});

test('ensureIndexes creates the users_email_unique index', async () => {
    const db = await getDb();
    const indexes = await db.collection('Users').listIndexes().toArray();
    const emailIndex = indexes.find((idx) => idx.name === 'users_email_unique');

    assert.ok(emailIndex, 'users_email_unique index should exist');
    assert.equal(emailIndex.unique, true);
});

test('ensureIndexes creates the character_owner_name_unique composite index', async () => {
    const db = await getDb();
    const indexes = await db.collection('Character').listIndexes().toArray();
    const compositeIndex = indexes.find((idx) => idx.name === 'character_owner_name_unique');

    assert.ok(compositeIndex, 'character_owner_name_unique index should exist');
    assert.equal(compositeIndex.unique, true);
    assert.ok(compositeIndex.key.email !== undefined, 'index should cover the email field');
    assert.ok(compositeIndex.key.characterName !== undefined, 'index should cover the characterName field');
});

test('ensureIndexes creates id unique indexes for all ten compendium collections', async () => {
    const db = await getDb();
    const collections = [
        'Races', 'Classes', 'Subclasses', 'Spells', 'Weapons',
        'Armor', 'Features', 'Backgrounds', 'Feats', 'Conditions'
    ];

    for (const collectionName of collections) {
        const indexes = await db.collection(collectionName).listIndexes().toArray();
        const idIndex = indexes.find((idx) => idx.name === `${collectionName.toLowerCase()}_id_unique`);

        assert.ok(idIndex, `${collectionName.toLowerCase()}_id_unique index should exist`);
        assert.equal(idIndex.unique, true);
    }
});

test('duplicate email insert fails after ensureIndexes enforces the unique constraint', async () => {
    const db = await getDb();
    await db.collection('Users').deleteMany({});

    await db.collection('Users').insertOne({ email: 'dupe@example.com', userName: 'alpha' });

    await assert.rejects(
        () => db.collection('Users').insertOne({ email: 'dupe@example.com', userName: 'beta' }),
        (error) => error.code === 11000
    );

    await db.collection('Users').deleteMany({});
});

test('closeMongoConnection resets the cached client so the next call reconnects', async () => {
    await assert.doesNotReject(() => pingDb());

    await closeMongoConnection();

    // Reconnect automatically on the next call
    const db = await getDb();
    const collections = await db.listCollections().toArray();
    assert.ok(Array.isArray(collections));
});

// This test must run last because it leaves the client in a disconnected state
// until the env var is restored (the test.after hook handles final cleanup).
test('getDb rejects when ATLAS_CONNECTION environment variable is not set', async () => {
    const savedUri = process.env.ATLAS_CONNECTION;
    delete process.env.ATLAS_CONNECTION;
    await closeMongoConnection();

    await assert.rejects(
        () => getDb(),
        /ATLAS_CONNECTION is required/
    );

    // Restore so test.after can run closeMongoConnection + mongoServer.stop cleanly
    process.env.ATLAS_CONNECTION = savedUri;
});
