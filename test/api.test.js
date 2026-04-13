const test = require('node:test');
const assert = require('node:assert/strict');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { closeMongoConnection, getDb } = require('../db/mongo');
const { createApp } = require('../app');
const { seedCompendium } = require('../seeds/loadSeedData');

let mongoServer;
let app;

test.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.ATLAS_CONNECTION = mongoServer.getUri();
    process.env.ACCESS_SECRET_TOKEN = 'test-secret';
    process.env.DB_NAME = 'DragonsData';
    process.env.FIVETOOLS_DATA_DIR = '';

    app = await createApp();
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
    await Promise.all([
        db.collection('Races').deleteMany({}),
        db.collection('Classes').deleteMany({}),
        db.collection('Subclasses').deleteMany({}),
        db.collection('Spells').deleteMany({}),
        db.collection('Weapons').deleteMany({}),
        db.collection('Armor').deleteMany({}),
        db.collection('Features').deleteMany({})
    ]);
    await seedCompendium(db);
});

async function seedUser() {
    const response = await request(app)
        .post('/signUp')
        .send({
            email: 'player@example.com',
            userName: 'player-one',
            password: 'Password123!'
        });

    assert.equal(response.statusCode, 201);
    return response.body.user;
}

async function signIn() {
    const response = await request(app)
        .post('/signIn')
        .send({
            email: 'player@example.com',
            password: 'Password123!'
        });

    assert.equal(response.statusCode, 200);
    return response.body.token;
}

test('POST /signUp creates a user', async () => {
    const response = await request(app)
        .post('/signUp')
        .send({
            email: 'player@example.com',
            userName: 'player-one',
            password: 'Password123!'
        });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.user.email, 'player@example.com');
    assert.equal(response.body.user.userName, 'player-one');
});

test('POST /signUp rejects duplicate email or username', async () => {
    await seedUser();

    const duplicateEmail = await request(app)
        .post('/signUp')
        .send({
            email: 'player@example.com',
            userName: 'player-two',
            password: 'Password123!'
        });

    const duplicateUserName = await request(app)
        .post('/signUp')
        .send({
            email: 'player2@example.com',
            userName: 'player-one',
            password: 'Password123!'
        });

    assert.equal(duplicateEmail.statusCode, 409);
    assert.equal(duplicateUserName.statusCode, 409);
});

test('POST /signIn returns a token for valid credentials', async () => {
    await seedUser();

    const response = await request(app)
        .post('/signIn')
        .send({
            email: 'player@example.com',
            password: 'Password123!'
        });

    assert.equal(response.statusCode, 200);
    assert.ok(response.body.token);

    const decoded = jwt.verify(response.body.token, process.env.ACCESS_SECRET_TOKEN);
    assert.equal(decoded.email, 'player@example.com');
});

test('POST /signIn rejects invalid credentials', async () => {
    await seedUser();

    const response = await request(app)
        .post('/signIn')
        .send({
            email: 'player@example.com',
            password: 'WrongPassword!'
        });

    assert.equal(response.statusCode, 401);
});

test('protected routes reject missing tokens', async () => {
    const response = await request(app).get('/player');
    assert.equal(response.statusCode, 401);
});

test('protected routes reject invalid tokens', async () => {
    const response = await request(app)
        .get('/player')
        .set('Authorization', 'Bearer invalid-token');

    assert.equal(response.statusCode, 403);
});

test('GET /compendium/bootstrap returns starter rules data', async () => {
    const response = await request(app).get('/compendium/bootstrap');

    assert.equal(response.statusCode, 200);
    assert.ok(response.body.races.some((race) => race.id === 'high-elf'));
    assert.ok(response.body.classes.some((classDoc) => classDoc.id === 'wizard'));
    assert.ok(response.body.subclasses.some((subclass) => subclass.id === 'evocation'));
    assert.ok(response.body.spells.some((spell) => spell.id === 'fireball'));
});

test('GET /player returns character summaries for the signed in user', async () => {
    await seedUser();
    const token = await signIn();
    const db = await getDb();

    await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Brim',
            raceId: 'high-elf',
            classId: 'wizard',
            subclassId: 'evocation',
            level: 5,
            baseAbilityScores: {
                str: 8,
                dex: 14,
                con: 13,
                int: 18,
                wis: 12,
                cha: 10
            },
            cantripIds: ['fire-bolt'],
            knownSpellIds: ['magic-missile', 'fireball'],
            preparedSpellIds: ['magic-missile', 'fireball']
        });

    await db.collection('Character').insertOne({
        email: 'someoneelse@example.com',
        userName: 'other-player',
        characterName: 'Not Yours',
        raceName: 'Human',
        className: 'Rogue',
        level: 2
    });

    const response = await request(app)
        .get('/player')
        .set('Authorization', `Bearer ${token}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.characters.length, 1);
    assert.equal(response.body.characters[0].characterName, 'Brim');
    assert.equal(response.body.characters[0].raceName, 'High Elf');
    assert.equal(response.body.characters[0].className, 'Wizard');
});

test('POST /player creates a character owned by the authenticated user and derives combat stats', async () => {
    await seedUser();
    const token = await signIn();

    const response = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Brim',
            raceId: 'hill-dwarf',
            classId: 'fighter',
            subclassId: 'champion',
            level: 3,
            background: 'Soldier',
            alignment: 'Lawful Good',
            baseAbilityScores: {
                str: 16,
                dex: 12,
                con: 16,
                int: 10,
                wis: 12,
                cha: 8
            },
            skillProficiencies: ['athletics', 'intimidation'],
            armorId: 'chain-mail',
            shieldId: 'shield',
            equippedWeaponIds: ['longsword', 'light-crossbow']
        });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.character.email, 'player@example.com');
    assert.equal(response.body.character.characterName, 'Brim');
    assert.equal(response.body.character.raceName, 'Hill Dwarf');
    assert.equal(response.body.character.className, 'Fighter');
    assert.equal(response.body.character.abilityScores.con, 18);
    assert.equal(response.body.character.proficiencyBonus, 2);
    assert.equal(response.body.character.maxHp, 37);
    assert.equal(response.body.character.armorClass, 18);
    assert.equal(response.body.character.attacks[0].attackBonus, 5);
    assert.equal(response.body.character.attacks[0].damageSummary, '1d8 + 3 slashing');
    assert.ok(response.body.character.featureIds.includes('improved-critical'));
});

test('GET /player/:characterId returns an owned character by id with spell data', async () => {
    await seedUser();
    const token = await signIn();

    const createResponse = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Brim',
            raceId: 'high-elf',
            classId: 'wizard',
            subclassId: 'evocation',
            level: 5,
            baseAbilityScores: {
                str: 8,
                dex: 14,
                con: 13,
                int: 18,
                wis: 12,
                cha: 10
            },
            armorId: null,
            shieldId: null,
            equippedWeaponIds: ['rapier', 'light-crossbow'],
            cantripIds: ['fire-bolt', 'mage-hand'],
            knownSpellIds: ['magic-missile', 'shield', 'scorching-ray', 'fireball'],
            preparedSpellIds: ['magic-missile', 'shield', 'scorching-ray', 'fireball']
        });

    const response = await request(app)
        .get(`/player/${createResponse.body.character._id}`)
        .set('Authorization', `Bearer ${token}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.character.characterName, 'Brim');
    assert.equal(response.body.character.email, 'player@example.com');
    assert.equal(response.body.character.abilityScores.dex, 16);
    assert.equal(response.body.character.abilityScores.int, 19);
    assert.equal(response.body.character.spellSaveDC, 15);
    assert.equal(response.body.character.spellAttackBonus, 7);
    assert.equal(response.body.character.spellSlots.level_3.slotTotal, 2);
    assert.equal(response.body.character.resolvedSpells.cantrips[0].damageSummary, '2d10 fire');
    assert.equal(response.body.character.attacks[0].proficient, false);
    assert.equal(response.body.character.attacks[1].proficient, true);
    assert.ok(response.body.character.featureIds.includes('sculpt-spells'));
});

test('PUT /player/:characterId updates an owned character and re-derives dependent stats', async () => {
    await seedUser();
    const token = await signIn();

    const createResponse = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Brim',
            raceId: 'high-elf',
            classId: 'wizard',
            subclassId: 'evocation',
            level: 3,
            baseAbilityScores: {
                str: 8,
                dex: 14,
                con: 13,
                int: 18,
                wis: 12,
                cha: 10
            },
            cantripIds: ['fire-bolt', 'mage-hand'],
            knownSpellIds: ['magic-missile', 'shield', 'scorching-ray'],
            preparedSpellIds: ['magic-missile', 'shield', 'scorching-ray']
        });

    const response = await request(app)
        .put(`/player/${createResponse.body.character._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
            level: 5,
            characterName: 'Archmage Brim',
            baseAbilityScores: {
                str: 8,
                dex: 14,
                con: 13,
                int: 20,
                wis: 12,
                cha: 10
            },
            knownSpellIds: ['magic-missile', 'shield', 'scorching-ray', 'fireball'],
            preparedSpellIds: ['magic-missile', 'shield', 'fireball']
        });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.character.characterName, 'Archmage Brim');
    assert.equal(response.body.character.level, 5);
    assert.equal(response.body.character.proficiencyBonus, 3);
    assert.equal(response.body.character.abilityScores.int, 21);
    assert.equal(response.body.character.spellSaveDC, 16);
    assert.equal(response.body.character.spellAttackBonus, 8);
    assert.equal(response.body.character.maxHp, 27);
    assert.equal(response.body.character.spellSlots.level_3.slotTotal, 2);
    assert.ok(response.body.character.availableSpellIds.includes('fireball'));
    assert.ok(response.body.character.featureIds.includes('third-level-spells'));
});

test('PUT /player/:characterId validates partial character updates', async () => {
    await seedUser();
    const token = await signIn();

    const createResponse = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Brim',
            raceId: 'high-elf',
            classId: 'wizard',
            subclassId: 'evocation',
            level: 5,
            baseAbilityScores: {
                str: 8,
                dex: 14,
                con: 13,
                int: 18,
                wis: 12,
                cha: 10
            }
        });

    const response = await request(app)
        .put(`/player/${createResponse.body.character._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
            level: 21
        });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'level must be an integer between 1 and 20');
});

test('POST /player validates required compendium fields', async () => {
    await seedUser();
    const token = await signIn();

    const response = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Broken Sheet',
            level: 0
        });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'raceId is required');
});
