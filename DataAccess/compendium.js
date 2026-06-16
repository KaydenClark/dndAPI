const { getDb } = require('../db/mongo');

const COLLECTIONS = {
    races: 'Races',
    classes: 'Classes',
    subclasses: 'Subclasses',
    spells: 'Spells',
    weapons: 'Weapons',
    armor: 'Armor',
    features: 'Features',
    backgrounds: 'Backgrounds',
    feats: 'Feats',
    conditions: 'Conditions'
};

async function listCollection(name, projection = { _id: 0 }) {
    const db = await getDb();
    return db.collection(COLLECTIONS[name]).find({}, { projection }).toArray();
}

async function getCollectionMap(name) {
    const documents = await listCollection(name);
    return new Map(documents.map((document) => [document.id, document]));
}

async function getCompendiumIndex() {
    const [races, classes, subclasses, spells, weapons, armor, features, backgrounds, feats, conditions] = await Promise.all([
        getCollectionMap('races'),
        getCollectionMap('classes'),
        getCollectionMap('subclasses'),
        getCollectionMap('spells'),
        getCollectionMap('weapons'),
        getCollectionMap('armor'),
        getCollectionMap('features'),
        getCollectionMap('backgrounds'),
        getCollectionMap('feats'),
        getCollectionMap('conditions')
    ]);

    return {
        races,
        classes,
        subclasses,
        spells,
        weapons,
        armor,
        features,
        backgrounds,
        feats,
        conditions
    };
}

async function getBootstrapCompendium() {
    const [races, classes, subclasses, weapons, armor, spells, backgrounds, feats, conditions] = await Promise.all([
        // raceGroup drives the base-race -> subrace two-step picker in the wizard
        listCollection('races', { _id: 0, id: 1, name: 1, speed: 1, size: 1, raceGroup: 1 }),
        // skillChoiceRules drives the Phase 1 skill proficiency selection UI
        // subclassLevel drives the wizard early-gate and LevelUpStudio notice
        listCollection('classes', { _id: 0, id: 1, name: 1, primaryAbilities: 1, skillChoiceRules: 1, subclassLevel: 1 }),
        listCollection('subclasses', { _id: 0, id: 1, classId: 1, name: 1 }),
        listCollection('weapons', { _id: 0, id: 1, name: 1, category: 1, weaponType: 1 }),
        listCollection('armor', { _id: 0, id: 1, name: 1, category: 1, baseAc: 1 }),
        listCollection('spells', { _id: 0, id: 1, name: 1, level: 1, classes: 1 }),
        // Backgrounds: client needs skill/language lists to show in character creation
        listCollection('backgrounds', { _id: 0, id: 1, name: 1, source: 1, skillProficiencies: 1, languages: 1, toolProficiencies: 1 }),
        // Feats: client needs prerequisite text so players can filter by what they qualify for
        listCollection('feats', { _id: 0, id: 1, name: 1, source: 1, prerequisite: 1, abilityBonus: 1 }),
        // Conditions: small enough to send the full description — powers the conditions tracker UI
        listCollection('conditions', { _id: 0, id: 1, name: 1, description: 1 })
    ]);

    return {
        races,
        classes,
        subclasses,
        weapons,
        armor,
        spells,
        backgrounds,
        feats,
        conditions
    };
}

module.exports = {
    getBootstrapCompendium,
    getCompendiumIndex
};
