const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
require('dotenv').config()


// Connection URL
const url = process.env.ATLAS_CONNECTION

const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}

const getCharacterById = (characterId) => {
    let iou = new Promise((resolve, reject) => {
    // Use connect method to connect to the server
        MongoClient.connect(url, settings, function (err, client) {
            if(err){
            reject(err)
            }else{
                console.log("Connected to server To get players characters");

                const db = client.db(dbName);
                // Get the contacts collection
                const collection = db.collection('Character');
                // Find some documents
                collection.find({ObjectId: characterId}).toArray(function (err, docs) {
                    if(err){
                        reject(err)
                    }else{
                        const results = {
                            data: docs,
                            msg: "Found the following records"
                        }
                        console.log(`found ${docs.length} documents`)
                        client.close();
                        // console.log(results)
                        resolve(results);
                    }
                });
            }
        });
    })
    return iou;
} // mongo code

module.exports = {getCharacterById}