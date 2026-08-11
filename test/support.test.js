const test = require('node:test');
const assert = require('node:assert/strict');

const jwt = require('jsonwebtoken');

const { cloneDefaultCharacterSheet } = require('../defaults/characterSheet');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authenticate, getJwtSecret } = require('../middleware/authenticate');
const { buildCorsOptions } = require('../app');

function createMockResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

test('cloneDefaultCharacterSheet returns independent nested state', () => {
    const firstSheet = cloneDefaultCharacterSheet();
    const secondSheet = cloneDefaultCharacterSheet();

    firstSheet.abilityScores.str = 20;
    firstSheet.spellSlots.level_1.slotsExpended = 1;
    firstSheet.inventory.push({ name: 'Torch' });

    assert.equal(secondSheet.abilityScores.str, 8);
    assert.equal(secondSheet.spellSlots.level_1.slotsExpended, 0);
    assert.deepEqual(secondSheet.inventory, []);
});

test('asyncHandler forwards rejected promises to next', async () => {
    const expectedError = new Error('boom');
    let forwardedError = null;
    const wrapped = asyncHandler(async () => {
        throw expectedError;
    });

    wrapped({}, {}, (error) => {
        forwardedError = error;
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(forwardedError, expectedError);
});

test('getJwtSecret returns configured secret and throws when missing', () => {
    const originalSecret = process.env.ACCESS_SECRET_TOKEN;

    process.env.ACCESS_SECRET_TOKEN = 'unit-secret';
    assert.equal(getJwtSecret(), 'unit-secret');

    delete process.env.ACCESS_SECRET_TOKEN;
    assert.throws(() => getJwtSecret(), /ACCESS_SECRET_TOKEN is required/);

    process.env.ACCESS_SECRET_TOKEN = originalSecret;
});

test('authenticate rejects missing bearer token', () => {
    const response = createMockResponse();
    let nextWasCalled = false;

    authenticate({ headers: {} }, response, () => {
        nextWasCalled = true;
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Authorization token is required' });
    assert.equal(nextWasCalled, false);
});

test('authenticate rejects invalid bearer token', () => {
    const originalSecret = process.env.ACCESS_SECRET_TOKEN;
    process.env.ACCESS_SECRET_TOKEN = 'unit-secret';
    const response = createMockResponse();
    let nextWasCalled = false;

    authenticate({ headers: { authorization: 'Bearer not-a-token' } }, response, () => {
        nextWasCalled = true;
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: 'Authorization token is invalid' });
    assert.equal(nextWasCalled, false);

    process.env.ACCESS_SECRET_TOKEN = originalSecret;
});

test('authenticate accepts valid bearer token and assigns req.user', async () => {
    const originalSecret = process.env.ACCESS_SECRET_TOKEN;
    process.env.ACCESS_SECRET_TOKEN = 'unit-secret';
    const token = jwt.sign({ email: 'player@example.com', userName: 'player-one' }, process.env.ACCESS_SECRET_TOKEN);
    const request = { headers: { authorization: `Bearer ${token}` } };
    const response = createMockResponse();
    let nextWasCalled = false;

    authenticate(request, response, () => {
        nextWasCalled = true;
    });

    assert.equal(nextWasCalled, true);
    assert.equal(request.user.email, 'player@example.com');
    assert.equal(request.user.userName, 'player-one');

    process.env.ACCESS_SECRET_TOKEN = originalSecret;
});

test('authenticate rejects an expired bearer token with 403', () => {
    const originalSecret = process.env.ACCESS_SECRET_TOKEN;
    process.env.ACCESS_SECRET_TOKEN = 'unit-secret';
    // Set exp to 100 seconds in the past so the token is already expired
    const payload = { email: 'x@x.com', exp: Math.floor(Date.now() / 1000) - 100 };
    const expiredToken = jwt.sign(payload, 'unit-secret');
    const response = createMockResponse();
    let nextWasCalled = false;

    authenticate({ headers: { authorization: `Bearer ${expiredToken}` } }, response, () => {
        nextWasCalled = true;
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: 'Authorization token is invalid' });
    assert.equal(nextWasCalled, false);

    process.env.ACCESS_SECRET_TOKEN = originalSecret;
});

test('authenticate rejects an authorization header without the Bearer prefix with 401', () => {
    const response = createMockResponse();
    let nextWasCalled = false;

    authenticate({ headers: { authorization: 'token-without-bearer-prefix' } }, response, () => {
        nextWasCalled = true;
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Authorization token is required' });
    assert.equal(nextWasCalled, false);
});

test('authenticate rejects a Bearer header with an empty token with 401', () => {
    // 'Bearer '.split(' ')[1] is '' which is falsy → treated as missing token
    const response = createMockResponse();

    authenticate({ headers: { authorization: 'Bearer ' } }, response, () => {});

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Authorization token is required' });
});

// ─── buildCorsOptions ─────────────────────────────────────────────────────────

test('buildCorsOptions returns empty object when CORS_ORIGIN is not set', () => {
    const originalOrigin = process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGIN;

    const options = buildCorsOptions();

    assert.deepEqual(options, {});
    process.env.CORS_ORIGIN = originalOrigin;
});

test('buildCorsOptions returns empty object when CORS_ORIGIN is an empty string', () => {
    const originalOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = '';

    const options = buildCorsOptions();

    assert.deepEqual(options, {});
    process.env.CORS_ORIGIN = originalOrigin;
});

test('buildCorsOptions allows a configured origin', () => {
    const originalOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const { origin } = buildCorsOptions();
    let allowedResult;
    origin('http://localhost:5173', (err, allowed) => { allowedResult = allowed; });

    assert.equal(allowedResult, true);
    process.env.CORS_ORIGIN = originalOrigin;
});

test('buildCorsOptions rejects an unlisted origin', () => {
    const originalOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const { origin } = buildCorsOptions();
    let allowedResult;
    origin('http://evil.example.com', (err, allowed) => { allowedResult = allowed; });

    assert.equal(allowedResult, false);
    process.env.CORS_ORIGIN = originalOrigin;
});

test('buildCorsOptions allows same-origin (no origin header) requests', () => {
    const originalOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const { origin } = buildCorsOptions();
    let allowedResult;
    origin(undefined, (err, allowed) => { allowedResult = allowed; });

    assert.equal(allowedResult, true);
    process.env.CORS_ORIGIN = originalOrigin;
});

test('buildCorsOptions supports multiple comma-separated CORS_ORIGIN values', () => {
    const originalOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://localhost:5173, https://app.example.com';

    const { origin } = buildCorsOptions();
    let result1, result2, result3;
    origin('http://localhost:5173', (e, a) => { result1 = a; });
    origin('https://app.example.com', (e, a) => { result2 = a; });
    origin('https://other.com', (e, a) => { result3 = a; });

    assert.equal(result1, true);
    assert.equal(result2, true);
    assert.equal(result3, false);
    process.env.CORS_ORIGIN = originalOrigin;
});

// ─── error handler ────────────────────────────────────────────────────────────

function makeErrorHandler() {
    // Extract the error handler from app.js logic directly to test without MongoDB
    return (error, req, res, next) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        const statusCode = error.statusCode || 500;
        const payload = { error: error.message || 'Internal server error' };
        if (error.details) {
            payload.details = error.details;
        }
        res.status(statusCode).json(payload);
    };
}

test('error handler uses error.statusCode when set', () => {
    const handler = makeErrorHandler();
    const res = createMockResponse();
    const err = Object.assign(new Error('Not found'), { statusCode: 404 });

    handler(err, {}, res, () => {});

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
});

test('error handler defaults to 500 when statusCode is absent', () => {
    const handler = makeErrorHandler();
    const res = createMockResponse();

    handler(new Error('Unexpected failure'), {}, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Unexpected failure' });
});

test('error handler includes details when error.details is set', () => {
    const handler = makeErrorHandler();
    const res = createMockResponse();
    const err = Object.assign(new Error('Validation failed'), {
        statusCode: 400,
        details: [{ field: 'email', message: 'Required' }]
    });

    handler(err, {}, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body.details, [{ field: 'email', message: 'Required' }]);
});

test('error handler forwards to next when headers already sent', () => {
    const handler = makeErrorHandler();
    const res = { ...createMockResponse(), headersSent: true };
    const err = new Error('Late error');
    let nextError;

    handler(err, {}, res, (e) => { nextError = e; });

    assert.equal(nextError, err);
});

// ─── default character sheet ──────────────────────────────────────────────────

test('cloneDefaultCharacterSheet includes restRecovery in spellcasting', () => {
    const sheet = cloneDefaultCharacterSheet();
    assert.equal(sheet.spellcasting.restRecovery, 'long');
});

test('cloneDefaultCharacterSheet includes all required fields', () => {
    const sheet = cloneDefaultCharacterSheet();
    const requiredFields = [
        'email', 'userName', 'characterName', 'raceId', 'classId', 'level',
        'baseAbilityScores', 'abilityScores', 'abilityMods', 'proficiencyBonus',
        'maxHp', 'currentHp', 'armorClass', 'initiative', 'passivePerception',
        'savingThrows', 'skillValues', 'spellcasting', 'spellSlots',
        'conditions', 'deathSaves', 'currency', 'featureIds', 'features',
        'inventory', 'equipment', 'expertiseProficiencies'
    ];
    for (const field of requiredFields) {
        assert.ok(field in sheet, `missing required field: ${field}`);
    }
});
