const races = require('./races.json');
const classes = require('./classes.json');
const subclasses = require('./subclasses.json');
const spells = require('./spells.json');
const weapons = require('./weapons.json');
const armor = require('./armor.json');
const features = require('./features.json');
// SRD seed data for collections the 5etools importer also populates.
// When FIVETOOLS_DATA_DIR is set the importer takes precedence; these are the
// fallbacks used in local development and CI.
const backgrounds = require('./backgrounds.json');
const feats = [];
const conditions = require('./conditions.json');
const users = require('./users.json');
const characters = require('./characters.json');
const { load5eToolsCompendium } = require('./import5etools');
const fs = require('fs');
const path = require('path');

const { buildCharacterDocument } = require('../services/characterDerivation');
const { getCompendiumIndex } = require('../DataAccess/compendium');
const { createSeedUser } = require('../DataAccess/users');

const COMPENDIUM_DATASETS = [
    { collection: 'Races', key: 'id', documents: races },
    { collection: 'Classes', key: 'id', documents: classes },
    { collection: 'Subclasses', key: 'id', documents: subclasses },
    { collection: 'Spells', key: 'id', documents: spells },
    { collection: 'Weapons', key: 'id', documents: weapons },
    { collection: 'Armor', key: 'id', documents: armor },
    { collection: 'Features', key: 'id', documents: features },
    { collection: 'Backgrounds', key: 'id', documents: backgrounds },
    { collection: 'Feats', key: 'id', documents: feats },
    { collection: 'Conditions', key: 'id', documents: conditions }
];

async function seedCompendium(db) {
    const configuredDataDir = process.env.FIVETOOLS_DATA_DIR;
    const resolvedDataDir = configuredDataDir
        ? path.resolve(process.cwd(), configuredDataDir)
        : '';
    const datasets = resolvedDataDir && fs.existsSync(resolvedDataDir)
        ? load5eToolsCompendium(resolvedDataDir)
        : COMPENDIUM_DATASETS;

    for (const dataset of datasets) {
        await db.collection(dataset.collection).deleteMany({});
    }

    for (const dataset of datasets) {
        for (const document of dataset.documents) {
            await db.collection(dataset.collection).replaceOne(
                { [dataset.key]: document[dataset.key] },
                document,
                { upsert: true }
            );
        }
    }
}

async function seedUsers(db) {
    for (const user of users) {
        await createSeedUser(user);
    }
}

async function seedCharacters(db) {
    const compendium = await getCompendiumIndex();

    for (const character of characters) {
        const owner = await db.collection('Users').findOne({ email: character.email });

        if (!owner) {
            throw new Error(`Cannot seed character ${character.characterName}: missing user ${character.email}`);
        }

        const document = buildCharacterDocument({
            ...character,
            email: owner.email,
            userName: character.userName || owner.userName,
            baseAbilityScores: character.baseAbilityScores || character.abilityScores
        }, compendium);

        await db.collection('Character').replaceOne(
            { email: document.email, characterName: document.characterName },
            document,
            { upsert: true }
        );
    }
}

module.exports = {
    seedCharacters,
    seedCompendium,
    seedUsers
};
