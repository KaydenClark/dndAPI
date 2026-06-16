const bcrypt = require('bcryptjs');

const { getDb } = require('../db/mongo');

const SALT_ROUNDS = 12;

function sanitizeUser(user) {
    return {
        _id: user._id.toString(),
        email: user.email,
        userName: user.userName,
        role: user.role || 'player',
        playerIds: user.playerIds || [],
        dmCampaignIds: user.dmCampaignIds || []
    };
}

async function findExistingUser({ email, userName }) {
    const db = await getDb();

    return db.collection('Users').findOne({
        $or: [{ email }, { userName }]
    });
}

async function findUserByEmail(email) {
    const db = await getDb();
    return db.collection('Users').findOne({ email });
}

async function createUser({ email, userName, password }) {
    const db = await getDb();
    const hashedpass = await bcrypt.hash(password, SALT_ROUNDS);

    const document = {
        email,
        userName,
        role: 'player',
        playerIds: [],
        dmCampaignIds: [],
        hashedpass,
        createdAt: new Date().toISOString()
    };

    const result = await db.collection('Users').insertOne(document);

    return sanitizeUser({ ...document, _id: result.insertedId });
}

async function createSeedUser(user) {
    const db = await getDb();
    const hashedpass = await bcrypt.hash(user.password, SALT_ROUNDS);

    const document = {
        email: user.email,
        userName: user.userName,
        role: user.role || 'player',
        playerIds: Array.isArray(user.playerIds) ? user.playerIds : [],
        dmCampaignIds: Array.isArray(user.dmCampaignIds) ? user.dmCampaignIds : [],
        hashedpass,
        createdAt: new Date().toISOString()
    };

    await db.collection('Users').replaceOne(
        { email: document.email },
        document,
        { upsert: true }
    );

    const storedUser = await db.collection('Users').findOne({ email: document.email });
    return sanitizeUser(storedUser);
}

async function validateUser(email, password) {
    const user = await findUserByEmail(email);

    if (!user) {
        return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.hashedpass);

    return passwordMatches ? user : null;
}

module.exports = {
    createUser,
    createSeedUser,
    findExistingUser,
    validateUser
};
