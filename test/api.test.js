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
    process.env.CORS_ORIGIN = 'http://localhost:5173';

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

test('POST /signUp validates required fields', async () => {
    const response = await request(app)
        .post('/signUp')
        .send({
            email: 'player@example.com',
            password: 'Password123!'
        });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Email, userName, and password are required');
});

test('POST /signUp trims username, normalizes email, and never returns password hash', async () => {
    const response = await request(app)
        .post('/signUp')
        .send({
            email: '  PLAYER@EXAMPLE.COM  ',
            userName: '  player-one  ',
            password: 'Password123!'
        });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.user.email, 'player@example.com');
    assert.equal(response.body.user.userName, 'player-one');
    assert.equal(response.body.user.hashedpass, undefined);
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

test('POST /signIn validates required fields', async () => {
    const response = await request(app)
        .post('/signIn')
        .send({
            email: 'player@example.com'
        });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Email and password are required');
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

test('GET / returns health status when database is reachable', async () => {
    const response = await request(app).get('/');

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { status: 'ok' });
});

test('unknown routes return a 404 JSON error', async () => {
    const response = await request(app).get('/missing-route');

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: 'Unknown request' });
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

test('GET /compendium/bootstrap returns client-safe projected data for every collection', async () => {
    const response = await request(app).get('/compendium/bootstrap');

    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(response.body.races));
    assert.ok(Array.isArray(response.body.classes));
    assert.ok(Array.isArray(response.body.subclasses));
    assert.ok(Array.isArray(response.body.weapons));
    assert.ok(Array.isArray(response.body.armor));
    assert.ok(Array.isArray(response.body.spells));
    assert.ok(Array.isArray(response.body.backgrounds));
    assert.ok(Array.isArray(response.body.feats));
    assert.ok(Array.isArray(response.body.conditions));
    assert.equal(response.body.races[0]._id, undefined);
    assert.equal(response.body.classes[0].hitDie, undefined);
    assert.ok(response.body.backgrounds.some((background) => background.id === 'soldier'));
});

// Phase II regression: wizard showed blank Class and Background steps because
// the DB was not seeded. This test catches that regression — if any of these
// are empty, the wizard cannot function.
test('GET /compendium/bootstrap returns non-empty races, classes, and backgrounds', async () => {
    const response = await request(app).get('/compendium/bootstrap');

    assert.equal(response.statusCode, 200);
    assert.ok(response.body.races.length > 0, 'races must not be empty — seed has not run');
    assert.ok(response.body.classes.length > 0, 'classes must not be empty — seed has not run');
    assert.ok(response.body.backgrounds.length > 0, 'backgrounds must not be empty — seed has not run');
});

// Phase II: raceGroup field added to drive the base-race -> subrace two-step
// picker in the creation wizard. Verify it is included in the projection.
test('GET /compendium/bootstrap includes raceGroup on race documents', async () => {
    const response = await request(app).get('/compendium/bootstrap');

    assert.equal(response.statusCode, 200);
    assert.ok(
        response.body.races.every((race) => typeof race.raceGroup === 'string'),
        'every race document must include a raceGroup string'
    );
    const highElf = response.body.races.find((r) => r.id === 'high-elf');
    assert.equal(highElf?.raceGroup, 'Elf');
    const human = response.body.races.find((r) => r.id === 'human');
    assert.equal(human?.raceGroup, 'Human');
});

test('GET /compendium/bootstrap includes seeded conditions for planned sheet tools', async () => {
    const response = await request(app).get('/compendium/bootstrap');

    assert.equal(response.statusCode, 200);
    assert.ok(response.body.conditions.length > 0, 'expected fallback condition seed data to be available');
    assert.ok(response.body.conditions.every((condition) => condition.id && condition.name && condition.description));
    assert.ok(response.body.conditions.some((condition) => condition.id === 'poisoned'));
    assert.ok(Array.isArray(response.body.feats), 'feats stay present but may be empty until ASI feat selection is implemented');
});

test('CORS allows the configured frontend origin', async () => {
    const response = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:5173');

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
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

test('GET /player returns an empty list for a signed in user with no characters', async () => {
    await seedUser();
    const token = await signIn();

    const response = await request(app)
        .get('/player')
        .set('Authorization', `Bearer ${token}`);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.characters, []);
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

test('POST /player rejects non-object payloads', async () => {
    await seedUser();
    const token = await signIn();

    const response = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send([]);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Character payload must be an object');
});

test('POST /player validates base ability scores', async () => {
    await seedUser();
    const token = await signIn();

    const response = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Broken Sheet',
            raceId: 'human',
            classId: 'fighter',
            level: 1,
            baseAbilityScores: {
                str: 10,
                dex: 10,
                con: 10,
                int: 10,
                wis: 10
            }
        });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values');
});

test('POST /player rejects duplicate character names for the same user', async () => {
    await seedUser();
    const token = await signIn();
    const payload = {
        characterName: 'Brim',
        raceId: 'human',
        classId: 'fighter',
        level: 1,
        baseAbilityScores: {
            str: 15,
            dex: 12,
            con: 14,
            int: 10,
            wis: 13,
            cha: 8
        }
    };

    const firstResponse = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);
    const duplicateResponse = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

    assert.equal(firstResponse.statusCode, 201);
    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.body.error, 'Character name already exists for this user');
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

test('GET /player/:characterId returns 404 for invalid or unowned ids', async () => {
    await seedUser();
    const token = await signIn();
    const db = await getDb();
    const inserted = await db.collection('Character').insertOne({
        email: 'someoneelse@example.com',
        userName: 'other-player',
        characterName: 'Not Yours',
        raceId: 'human',
        classId: 'fighter',
        level: 1
    });

    const invalidId = await request(app)
        .get('/player/not-a-valid-id')
        .set('Authorization', `Bearer ${token}`);
    const unownedId = await request(app)
        .get(`/player/${inserted.insertedId}`)
        .set('Authorization', `Bearer ${token}`);

    assert.equal(invalidId.statusCode, 404);
    assert.equal(unownedId.statusCode, 404);
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

test('PUT /player/:characterId returns 404 for invalid or unowned ids', async () => {
    await seedUser();
    const token = await signIn();
    const db = await getDb();
    const inserted = await db.collection('Character').insertOne({
        email: 'someoneelse@example.com',
        userName: 'other-player',
        characterName: 'Not Yours',
        raceId: 'human',
        classId: 'fighter',
        level: 1
    });

    const invalidId = await request(app)
        .put('/player/not-a-valid-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ level: 2 });
    const unownedId = await request(app)
        .put(`/player/${inserted.insertedId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ level: 2 });

    assert.equal(invalidId.statusCode, 404);
    assert.equal(unownedId.statusCode, 404);
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

test('PUT /player/:characterId rejects duplicate renamed character names for the same user', async () => {
    await seedUser();
    const token = await signIn();
    const firstPayload = {
        characterName: 'Brim',
        raceId: 'human',
        classId: 'fighter',
        level: 1,
        baseAbilityScores: {
            str: 15,
            dex: 12,
            con: 14,
            int: 10,
            wis: 13,
            cha: 8
        }
    };
    const secondPayload = {
        ...firstPayload,
        characterName: 'Ash'
    };

    await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send(firstPayload);
    const secondResponse = await request(app)
        .post('/player')
        .set('Authorization', `Bearer ${token}`)
        .send(secondPayload);

    const response = await request(app)
        .put(`/player/${secondResponse.body.character._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
            characterName: 'Brim'
        });

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error, 'Character name already exists for this user');
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
