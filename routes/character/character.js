const express = require('express');

const {
    createCharacter,
    getCharacterByIdForEmail,
    listCharacterSummariesByEmail,
    updateCharacterForEmail
} = require('../../DataAccess/characters');
const { authenticate } = require('../../middleware/authenticate');
const { asyncHandler } = require('../../middleware/asyncHandler');

const router = express.Router();

router.use(authenticate);

function isAbilityScoreObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    return ['str', 'dex', 'con', 'int', 'wis', 'cha']
        .every((key) => Number.isFinite(Number(value[key])));
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function validateCharacterPayload(payload, { partial = false } = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return 'Character payload must be an object';
    }

    if (!partial || hasOwn(payload, 'characterName')) {
        const characterName = typeof payload.characterName === 'string'
            ? payload.characterName.trim()
            : '';

        if (!characterName) {
            return 'characterName is required';
        }
    }

    if (!partial || hasOwn(payload, 'raceId')) {
        const raceId = typeof payload.raceId === 'string' ? payload.raceId.trim() : '';

        if (!raceId) {
            return 'raceId is required';
        }
    }

    if (!partial || hasOwn(payload, 'classId')) {
        const classId = typeof payload.classId === 'string' ? payload.classId.trim() : '';

        if (!classId) {
            return 'classId is required';
        }
    }

    if (!partial || hasOwn(payload, 'level')) {
        const level = Number(payload.level);

        if (!Number.isInteger(level) || level < 1 || level > 20) {
            return 'level must be an integer between 1 and 20';
        }
    }

    if (hasOwn(payload, 'baseAbilityScores') && !isAbilityScoreObject(payload.baseAbilityScores)) {
        return 'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values';
    }

    return null;
}

router.post('/', asyncHandler(async (req, res) => {
    const validationError = validateCharacterPayload(req.body);

    if (validationError) {
        res.status(400).json({ error: validationError });
        return;
    }

    const character = await createCharacter(req.user, req.body);

    res.status(201).json({ character });
}));

router.put('/:characterId', asyncHandler(async (req, res) => {
    const validationError = validateCharacterPayload(req.body, { partial: true });

    if (validationError) {
        res.status(400).json({ error: validationError });
        return;
    }

    const character = await updateCharacterForEmail(req.params.characterId, req.user.email, req.body);

    if (!character) {
        res.status(404).json({ error: 'Character not found' });
        return;
    }

    res.json({ character });
}));

router.get('/', asyncHandler(async (req, res) => {
    const characters = await listCharacterSummariesByEmail(req.user.email);
    res.json({ characters });
}));

router.get('/:characterId', asyncHandler(async (req, res) => {
    const character = await getCharacterByIdForEmail(req.params.characterId, req.user.email);

    if (!character) {
        res.status(404).json({ error: 'Character not found' });
        return;
    }

    res.json({ character });
}));

module.exports = router;
