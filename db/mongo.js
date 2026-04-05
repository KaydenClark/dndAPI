const { MongoClient } = require('mongodb');

const DATABASE_NAME = process.env.DB_NAME || 'DragonsData';

let clientPromise;
let cachedClient;

function getMongoUri() {
    if (!process.env.ATLAS_CONNECTION) {
        const error = new Error('ATLAS_CONNECTION is required');
        error.statusCode = 500;
        throw error;
    }

    return process.env.ATLAS_CONNECTION;
}

async function getMongoClient() {
    if (cachedClient) {
        return cachedClient;
    }

    if (!clientPromise) {
        clientPromise = MongoClient.connect(getMongoUri());
    }

    cachedClient = await clientPromise;
    return cachedClient;
}

async function getDb() {
    const client = await getMongoClient();
    return client.db(DATABASE_NAME);
}

async function createUserNameIndex(db) {
    const duplicates = await db.collection('Users').aggregate([
        {
            $match: {
                userName: { $type: 'string', $ne: '' }
            }
        },
        {
            $group: {
                _id: '$userName',
                count: { $sum: 1 }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        },
        { $limit: 1 }
    ]).toArray();

    if (duplicates.length === 0) {
        await db.collection('Users').createIndex(
            { userName: 1 },
            { unique: true, name: 'users_userName_unique' }
        );
        return;
    }

    await db.collection('Users').createIndex(
        { userName: 1 },
        { name: 'users_userName_lookup' }
    );
}

async function ensureIndexes() {
    const db = await getDb();

    await db.collection('Users').createIndex(
        { email: 1 },
        { unique: true, name: 'users_email_unique' }
    );

    await createUserNameIndex(db);

    await db.collection('Character').createIndex(
        { email: 1 },
        { name: 'character_email_lookup' }
    );

    await db.collection('Character').createIndex(
        { email: 1, characterName: 1 },
        { unique: true, name: 'character_owner_name_unique' }
    );

    for (const collectionName of ['Races', 'Classes', 'Subclasses', 'Spells', 'Weapons', 'Armor', 'Features']) {
        await db.collection(collectionName).createIndex(
            { id: 1 },
            { unique: true, name: `${collectionName.toLowerCase()}_id_unique` }
        );
    }
}

async function pingDb() {
    const db = await getDb();
    await db.command({ ping: 1 });
}

async function closeMongoConnection() {
    if (!cachedClient) {
        clientPromise = undefined;
        return;
    }

    await cachedClient.close();
    cachedClient = undefined;
    clientPromise = undefined;
}

module.exports = {
    closeMongoConnection,
    ensureIndexes,
    getDb,
    pingDb
};
