const test = require('node:test');
const assert = require('node:assert/strict');

const jwt = require('jsonwebtoken');

const { cloneDefaultCharacterSheet } = require('../defaults/characterSheet');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authenticate, getJwtSecret } = require('../middleware/authenticate');

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
