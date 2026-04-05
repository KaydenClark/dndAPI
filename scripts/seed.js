require('dotenv').config();

const { ensureIndexes, getDb, closeMongoConnection } = require('../db/mongo');
const { seedCharacters, seedCompendium, seedUsers } = require('../seeds/loadSeedData');

async function main() {
    await ensureIndexes();

    const db = await getDb();

    await seedCompendium(db);
    await seedUsers(db);
    await seedCharacters(db);

    console.log('Seed data loaded.');
}

main()
    .catch((error) => {
        console.error('Seed failed', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeMongoConnection();
    });
