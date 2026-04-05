const { getDb } = require('../db/mongo');

const COLLECTIONS = {
    races: 'Races',
    classes: 'Classes',
    subclasses: 'Subclasses',
    spells: 'Spells',
    weapons: 'Weapons',
    armor: 'Armor',
    features: 'Features'
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
    const [races, classes, subclasses, spells, weapons, armor, features] = await Promise.all([
        getCollectionMap('races'),
        getCollectionMap('classes'),
        getCollectionMap('subclasses'),
        getCollectionMap('spells'),
        getCollectionMap('weapons'),
        getCollectionMap('armor'),
        getCollectionMap('features')
    ]);

    return {
        races,
        classes,
        subclasses,
        spells,
        weapons,
        armor,
        features
    };
}

async function getBootstrapCompendium() {
    const [races, classes, subclasses, weapons, armor, spells] = await Promise.all([
        listCollection('races', { _id: 0, id: 1, name: 1, speed: 1, size: 1 }),
        listCollection('classes', { _id: 0, id: 1, name: 1, primaryAbilities: 1 }),
        listCollection('subclasses', { _id: 0, id: 1, classId: 1, name: 1 }),
        listCollection('weapons', { _id: 0, id: 1, name: 1, category: 1, weaponType: 1 }),
        listCollection('armor', { _id: 0, id: 1, name: 1, category: 1, baseAc: 1 }),
        listCollection('spells', { _id: 0, id: 1, name: 1, level: 1, classes: 1 })
    ]);

    return {
        races,
        classes,
        subclasses,
        weapons,
        armor,
        spells
    };
}

module.exports = {
    COLLECTIONS,
    getBootstrapCompendium,
    getCompendiumIndex,
    listCollection
};
