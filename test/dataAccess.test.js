// Unit tests for the DataAccess layer (users, characters, compendium).
// Uses mongodb-memory-server so no real Atlas connection is required.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { closeMongoConnection, ensureIndexes, getDb } = require('../db/mongo');
const { createUser, createSeedUser, validateUser } = require('../DataAccess/users');
const { listCharacterSummariesByEmail } = require('../DataAccess/characters');
const { getCollectionMap, getCompendiumIndex } = require('../DataAccess/compendium');
const { seedCompendium } = require('../seeds/loadSeedData');

let mongoServer;

test.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.ATLAS_CONNECTION = mongoServer.getUri();
    process.env.DB_NAME = 'DataAccessTestDb';
    process.env.FIVETOOLS_DATA_DIR = '';
    await ensureIndexes();

    // Seed compendium data once — the compendium collections persist across
    // tests; only Users and Character are cleared in beforeEach.
    const db = await getDb();
    await seedCompendium(db);
});

test.after(async () => {
    await closeMongoConnection();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

test.beforeEach(async () => {
    const db = await getDb();
    await db.collection('Users').deleteMany({});
    await db.collection('Character').deleteMany({});
});

// ─── DataAccess/users.js ─────────────────────────────────────────────────────

test('createUser returns a sanitized user document without the password hash', async () => {
    const user = await createUser({
        email: 'test@example.com',
        userName: 'tester',
        password: 'Password123!'
    });

    assert.equal(user.email, 'test@example.com');
    assert.equal(user.userName, 'tester');
    assert.ok(user._id, 'should include an _id string');
    assert.equal(typeof user._id, 'string');
    assert.equal(user.role, 'player');
    assert.equal(user.hashedpass, undefined, 'hashedpass must not be returned');
    assert.deepEqual(user.playerIds, []);
    assert.deepEqual(user.dmCampaignIds, []);
});

test('createUser stores a bcrypt-hashed password in the database', async () => {
    await createUser({ email: 'test@example.com', userName: 'tester', password: 'Secret!' });

    const db = await getDb();
    const stored = await db.collection('Users').findOne({ email: 'test@example.com' });

    assert.ok(stored.hashedpass, 'hashedpass should be persisted');
    assert.notEqual(stored.hashedpass, 'Secret!', 'plaintext password must not be stored');
    assert.ok(stored.hashedpass.startsWith('$2'), 'stored value should be a bcrypt hash');
});

test('validateUser returns the stored user for correct credentials', async () => {
    await createUser({ email: 'test@example.com', userName: 'tester', password: 'Correct!' });
    const user = await validateUser('test@example.com', 'Correct!');

    assert.ok(user, 'should return a user document');
    assert.equal(user.email, 'test@example.com');
});

test('validateUser returns null for an incorrect password', async () => {
    await createUser({ email: 'test@example.com', userName: 'tester', password: 'Correct!' });
    const result = await validateUser('test@example.com', 'Wrong!');

    assert.equal(result, null);
});

test('validateUser returns null when the email does not exist', async () => {
    const result = await validateUser('nobody@example.com', 'Password!');
    assert.equal(result, null);
});

test('createSeedUser upserts so a second call with the same email does not throw', async () => {
    const seedData = { email: 'seed@example.com', userName: 'seedy', password: 'Seed123!' };
    const first = await createSeedUser(seedData);
    const second = await createSeedUser(seedData);

    assert.equal(first.email, second.email);
    assert.equal(first.userName, second.userName);

    const db = await getDb();
    const count = await db.collection('Users').countDocuments({ email: 'seed@example.com' });
    assert.equal(count, 1, 'upsert should not create a second document');
});

// ─── DataAccess/characters.js ────────────────────────────────────────────────

test('listCharacterSummariesByEmail returns only characters owned by the given email', async () => {
    const db = await getDb();
    await db.collection('Character').insertMany([
        { email: 'player@example.com', userName: 'player', characterName: 'Hero', raceName: 'Human', className: 'Fighter', level: 1 },
        { email: 'player@example.com', userName: 'player', characterName: 'Sidekick', raceName: 'Elf', className: 'Wizard', level: 2 },
        { email: 'other@example.com', userName: 'other', characterName: 'Villain', raceName: 'Orc', className: 'Barbarian', level: 5 }
    ]);

    const summaries = await listCharacterSummariesByEmail('player@example.com');

    assert.equal(summaries.length, 2);
    assert.ok(summaries.every((s) => s.email === 'player@example.com'));
    assert.ok(!summaries.some((s) => s.characterName === 'Villain'));
});

test('listCharacterSummariesByEmail returns characters sorted alphabetically by name', async () => {
    const db = await getDb();
    await db.collection('Character').insertMany([
        { email: 'player@example.com', userName: 'player', characterName: 'Zara', raceName: 'Human', className: 'Rogue', level: 1 },
        { email: 'player@example.com', userName: 'player', characterName: 'Aldo', raceName: 'Elf', className: 'Wizard', level: 1 }
    ]);

    const summaries = await listCharacterSummariesByEmail('player@example.com');

    assert.equal(summaries[0].characterName, 'Aldo');
    assert.equal(summaries[1].characterName, 'Zara');
});

test('listCharacterSummariesByEmail returns an empty array when the user has no characters', async () => {
    const summaries = await listCharacterSummariesByEmail('nobody@example.com');
    assert.deepEqual(summaries, []);
});

test('listCharacterSummariesByEmail summary includes only safe fields and a string _id', async () => {
    const db = await getDb();
    await db.collection('Character').insertOne({
        email: 'player@example.com',
        userName: 'player',
        characterName: 'Hero',
        raceName: 'Human',
        className: 'Fighter',
        level: 1,
        hashedpass: 'should-never-appear'
    });

    const summaries = await listCharacterSummariesByEmail('player@example.com');
    const summary = summaries[0];

    assert.equal(typeof summary._id, 'string', '_id should be serialised as a string');
    assert.ok(summary.characterName);
    assert.ok(summary.email);
    assert.equal(summary.hashedpass, undefined, 'sensitive fields must not appear in summaries');
});

// ─── DataAccess/compendium.js ────────────────────────────────────────────────

test('getCollectionMap returns a Map keyed by each document id', async () => {
    const racesMap = await getCollectionMap('races');

    assert.ok(racesMap instanceof Map, 'result should be a Map');
    assert.ok(racesMap.size > 0, 'map should be non-empty after seeding');

    for (const [key, doc] of racesMap) {
        assert.equal(key, doc.id, `map key "${key}" must match the document id field`);
    }
});

test('getCompendiumIndex returns Maps for all ten collections', async () => {
    const compendium = await getCompendiumIndex();

    const expectedKeys = ['races', 'classes', 'subclasses', 'spells', 'weapons', 'armor', 'features', 'backgrounds', 'feats', 'conditions'];
    for (const key of expectedKeys) {
        assert.ok(compendium[key] instanceof Map, `compendium.${key} should be a Map`);
    }

    // Spot-check that seeded collections are non-empty
    assert.ok(compendium.races.size > 0, 'races should have entries');
    assert.ok(compendium.classes.size > 0, 'classes should have entries');
    assert.ok(compendium.spells.size > 0, 'spells should have entries');
});
