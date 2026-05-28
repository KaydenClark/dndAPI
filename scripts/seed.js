require('dotenv').config();

const { ensureIndexes, getDb } = require('../db/mongo');
const { seedCharacters, seedCompendium, seedUsers } = require('../seeds/loadSeedData');

async function main() {
    await ensureIndexes();

    const db = await getDb();

    await seedCompendium(db);
    await seedUsers(db);
    await seedCharacters(db);

    const collectionNames = [
        'Races',
        'Classes',
        'Subclasses',
        'Spells',
        'Weapons',
        'Armor',
        'Features',
        'Backgrounds',
        'Feats',
        'Conditions'
    ];
    const counts = await Promise.all(
        collectionNames.map(async (name) => [name, await db.collection(name).countDocuments()])
    );

    console.log('Seed data loaded.');
    for (const [name, count] of counts) {
        console.log(`${name}: ${count}`);
    }

    // The MongoDB driver can keep sockets alive after a successful Atlas seed.
    // Exit the CLI once counts are printed so the runbook command is reliable.
    process.exit(0);
}

main()
    .catch((error) => {
        console.error('Seed failed', error);
        process.exit(1);
    });
