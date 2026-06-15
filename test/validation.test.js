// Pure unit tests for character payload validation helpers.
// No database or network required — these are synchronous checks only.

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCharacterPayload, isAbilityScoreObject } = require('../routes/character/character');

// ─── isAbilityScoreObject ────────────────────────────────────────────────────

test('isAbilityScoreObject returns false for null', () => {
    assert.equal(isAbilityScoreObject(null), false);
});

test('isAbilityScoreObject returns false for arrays', () => {
    assert.equal(isAbilityScoreObject([10, 10, 10, 10, 10, 10]), false);
});

test('isAbilityScoreObject returns false for primitive strings', () => {
    assert.equal(isAbilityScoreObject('10'), false);
});

test('isAbilityScoreObject returns false when any ability key is missing', () => {
    // All six keys are required; cha is omitted here
    assert.equal(isAbilityScoreObject({ str: 10, dex: 10, con: 10, int: 10, wis: 10 }), false);
});

test('isAbilityScoreObject returns false when any value cannot coerce to a finite number', () => {
    // 'ten' → NaN, undefined → NaN — both fail Number.isFinite check
    assert.equal(isAbilityScoreObject({ str: 'ten', dex: 10, con: 10, int: 10, wis: 10, cha: 10 }), false);
    assert.equal(isAbilityScoreObject({ str: undefined, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }), false);
});

test('isAbilityScoreObject treats null values as 0 (Number(null) === 0)', () => {
    // null coerces to 0 which is a finite number — the function accepts it
    assert.equal(isAbilityScoreObject({ str: null, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }), true);
});

test('isAbilityScoreObject returns false for undefined input', () => {
    assert.equal(isAbilityScoreObject(undefined), false);
});

test('isAbilityScoreObject returns true for a valid six-key numeric object', () => {
    assert.equal(isAbilityScoreObject({ str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 }), true);
});

test('isAbilityScoreObject accepts numeric-string ability score values', () => {
    // Number('10') is 10, which is finite — valid
    assert.equal(isAbilityScoreObject({ str: '15', dex: '12', con: '14', int: '10', wis: '13', cha: '8' }), true);
});

// ─── validateCharacterPayload — full (create) mode ───────────────────────────

const VALID_PAYLOAD = {
    characterName: 'Hero',
    raceId: 'human',
    classId: 'fighter',
    level: 1
};

test('validateCharacterPayload returns null for a minimal valid payload', () => {
    assert.equal(validateCharacterPayload(VALID_PAYLOAD), null);
});

test('validateCharacterPayload rejects array payloads', () => {
    assert.equal(validateCharacterPayload([]), 'Character payload must be an object');
});

test('validateCharacterPayload rejects null payloads', () => {
    assert.equal(validateCharacterPayload(null), 'Character payload must be an object');
});

test('validateCharacterPayload rejects string payloads', () => {
    assert.equal(validateCharacterPayload('hero'), 'Character payload must be an object');
});

test('validateCharacterPayload requires a non-empty characterName', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, characterName: '' }),
        'characterName is required'
    );
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, characterName: '   ' }),
        'characterName is required'
    );
    assert.equal(
        validateCharacterPayload({ raceId: 'human', classId: 'fighter', level: 1 }),
        'characterName is required'
    );
});

test('validateCharacterPayload requires a non-empty raceId', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, raceId: '' }),
        'raceId is required'
    );
    assert.equal(
        validateCharacterPayload({ characterName: 'Hero', classId: 'fighter', level: 1 }),
        'raceId is required'
    );
});

test('validateCharacterPayload requires a non-empty classId', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, classId: '' }),
        'classId is required'
    );
});

test('validateCharacterPayload rejects level 0', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, level: 0 }),
        'level must be an integer between 1 and 20'
    );
});

test('validateCharacterPayload rejects level 21', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, level: 21 }),
        'level must be an integer between 1 and 20'
    );
});

test('validateCharacterPayload rejects negative levels', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, level: -1 }),
        'level must be an integer between 1 and 20'
    );
});

test('validateCharacterPayload rejects non-integer levels', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, level: 1.5 }),
        'level must be an integer between 1 and 20'
    );
});

test('validateCharacterPayload rejects missing baseAbilityScores (only 5 stats)', () => {
    assert.equal(
        validateCharacterPayload({
            ...VALID_PAYLOAD,
            baseAbilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10 }
        }),
        'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values'
    );
});

test('validateCharacterPayload rejects non-numeric baseAbilityScores', () => {
    assert.equal(
        validateCharacterPayload({
            ...VALID_PAYLOAD,
            baseAbilityScores: { str: 'ten', dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
        }),
        'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values'
    );
});

test('validateCharacterPayload rejects array baseAbilityScores', () => {
    assert.equal(
        validateCharacterPayload({ ...VALID_PAYLOAD, baseAbilityScores: [10, 10, 10, 10, 10, 10] }),
        'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values'
    );
});

test('validateCharacterPayload accepts a valid complete ability score object', () => {
    assert.equal(
        validateCharacterPayload({
            ...VALID_PAYLOAD,
            baseAbilityScores: { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 }
        }),
        null
    );
});

// ─── validateCharacterPayload — partial (update) mode ───────────────────────

test('partial update allows an empty payload', () => {
    assert.equal(validateCharacterPayload({}, { partial: true }), null);
});

test('partial update validates level when the level key is present', () => {
    assert.equal(
        validateCharacterPayload({ level: 0 }, { partial: true }),
        'level must be an integer between 1 and 20'
    );
    assert.equal(validateCharacterPayload({ level: 5 }, { partial: true }), null);
    assert.equal(validateCharacterPayload({ level: 20 }, { partial: true }), null);
});

test('partial update validates characterName when the key is present', () => {
    assert.equal(
        validateCharacterPayload({ characterName: '' }, { partial: true }),
        'characterName is required'
    );
    assert.equal(
        validateCharacterPayload({ characterName: 'New Name' }, { partial: true }),
        null
    );
});

test('partial update validates raceId when the key is present', () => {
    assert.equal(
        validateCharacterPayload({ raceId: '' }, { partial: true }),
        'raceId is required'
    );
    assert.equal(
        validateCharacterPayload({ raceId: 'elf' }, { partial: true }),
        null
    );
});

test('partial update validates baseAbilityScores when the key is present', () => {
    assert.equal(
        validateCharacterPayload(
            { baseAbilityScores: { str: 10 } },
            { partial: true }
        ),
        'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values'
    );
});
