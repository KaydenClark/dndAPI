const express = require('express');

const {
    createCharacter,
    getCharacterByIdForEmail,
    listCharacterSummariesByEmail
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

router.post('/', asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'Character payload must be an object' });
        return;
    }

    const characterName = typeof req.body.characterName === 'string'
        ? req.body.characterName.trim()
        : '';

    if (!characterName) {
        res.status(400).json({ error: 'characterName is required' });
        return;
    }

    const raceId = typeof req.body.raceId === 'string' ? req.body.raceId.trim() : '';
    const classId = typeof req.body.classId === 'string' ? req.body.classId.trim() : '';
    const level = Number(req.body.level);

    if (!raceId) {
        res.status(400).json({ error: 'raceId is required' });
        return;
    }

    if (!classId) {
        res.status(400).json({ error: 'classId is required' });
        return;
    }

    if (!Number.isInteger(level) || level < 1 || level > 20) {
        res.status(400).json({ error: 'level must be an integer between 1 and 20' });
        return;
    }

    if (req.body.baseAbilityScores && !isAbilityScoreObject(req.body.baseAbilityScores)) {
        res.status(400).json({ error: 'baseAbilityScores must include numeric str, dex, con, int, wis, and cha values' });
        return;
    }

    const character = await createCharacter(req.user, req.body);

    res.status(201).json({ character });
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
