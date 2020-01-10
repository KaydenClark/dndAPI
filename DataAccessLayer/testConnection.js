const MongoClient = require('mongodb').MongoClient;
// const ObjectId = require("mongodb").ObjectId;
require('dotenv').config()


// Connection URL
const url = process.env.ATLAS_CONNECTION

const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}

const testConnection = () => {
    console.log('connectiing...')
    const iou = new Promise((resolve, reject) => {
        // Use connect method to connect to the server
        MongoClient.connect(url, settings, function (err, client) {
            if(err){
                reject(err)
            } else {
                const db = client.db(dbName);
                client.close();
                resolve("Connected successfully to server")
                console.log("Connected to Server")
            }
        });
    })
    return iou
}


testConnection()

module.exports = {testConnection}