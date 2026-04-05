const { ObjectId } = require('mongodb');

const { cloneDefaultCharacterSheet } = require('../defaults/characterSheet');
const { getCompendiumIndex } = require('./compendium');
const { getDb } = require('../db/mongo');
const { buildCharacterDocument } = require('../services/characterDerivation');

function isDuplicateKeyError(error) {
    return error?.code === 11000;
}

function serializeCharacter(document) {
    if (!document) {
        return null;
    }

    return {
        ...document,
        _id: document._id.toString()
    };
}

function buildCharacterSummary(document) {
    return {
        _id: document._id.toString(),
        email: document.email,
        userName: document.userName,
        characterName: document.characterName,
        raceName: document.raceName,
        className: document.className,
        level: document.level
    };
}

async function prepareCharacterDocument(owner, payload, existingDocument = {}) {
    const compendium = await getCompendiumIndex();
    const inferredBaseAbilityScores = payload.baseAbilityScores
        || existingDocument.baseAbilityScores
        || (payload.abilityScores && !existingDocument.baseAbilityScores ? payload.abilityScores : undefined);
    const baseDocument = {
        ...cloneDefaultCharacterSheet(),
        ...existingDocument,
        ...payload,
        email: owner.email,
        userName: payload.userName || existingDocument.userName || owner.userName || '',
        characterName: typeof payload.characterName === 'string'
            ? payload.characterName.trim()
            : existingDocument.characterName || ''
    };

    if (inferredBaseAbilityScores) {
        baseDocument.baseAbilityScores = inferredBaseAbilityScores;
    }

    if (payload.maxHp === undefined && existingDocument.maxHp === undefined) {
        delete baseDocument.maxHp;
    }

    if (payload.currentHp === undefined && existingDocument.currentHp === undefined) {
        delete baseDocument.currentHp;
    }

    if (payload.hitDiceRemaining === undefined && existingDocument.hitDiceRemaining === undefined) {
        delete baseDocument.hitDiceRemaining;
    }

    return buildCharacterDocument(baseDocument, compendium);
}

async function listCharacterSummariesByEmail(email) {
    const db = await getDb();
    const characters = await db.collection('Character')
        .find({ email })
        .sort({ characterName: 1 })
        .toArray();

    return characters.map(buildCharacterSummary);
}

async function createCharacter(owner, payload) {
    const db = await getDb();
    const character = await prepareCharacterDocument(owner, payload);
    const document = {
        ...character,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    let result;

    try {
        result = await db.collection('Character').insertOne(document);
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            error.statusCode = 409;
            error.message = 'Character name already exists for this user';
        }

        throw error;
    }

    return serializeCharacter({
        ...character,
        _id: result.insertedId
    });
}

async function getCharacterByIdForEmail(characterId, email) {
    if (!ObjectId.isValid(characterId)) {
        return null;
    }

    const db = await getDb();
    const storedCharacter = await db.collection('Character').findOne({
        _id: new ObjectId(characterId),
        email
    });

    if (!storedCharacter) {
        return null;
    }

    const owner = {
        email: storedCharacter.email,
        userName: storedCharacter.userName
    };

    const character = await prepareCharacterDocument(owner, storedCharacter, storedCharacter);
    return serializeCharacter({ ...character, _id: storedCharacter._id, createdAt: storedCharacter.createdAt });
}

module.exports = {
    createCharacter,
    getCharacterByIdForEmail,
    listCharacterSummariesByEmail,
    prepareCharacterDocument
};
