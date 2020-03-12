const MongoClient = require('mongodb').MongoClient;
// const ObjectId = require("mongodb").ObjectId;
require('dotenv').config()


// Connection URL
const url = process.env.ATLAS_CONNECTION

const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}

const readPlayersCharacters = (playerEmail) => {
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
                collection.find({email: playerEmail}).toArray(function (err, docs) {
                    if(err){
                        reject(err)
                    }else{
                        const results = {
                            data: docs,
                            msg: "Found the following records"
                        }
                        let characterList = []
                        for(i = 0; i < results.data.length; i++){
                            characterData = {
                                _id: results.data[i]._id,
                                email: results.data[i].email,
                                userName: results.data[i].userName,
                                characterName: results.data[i].characterName
                            }
                            characterList.push(characterData)
                        }
                        console.log(characterList)
                        console.log(results)
                        console.log(`found ${docs.length} documents`)
                        client.close();
                        resolve(characterList);
                    }
                });
            }
        });
    })
    return iou;
} // mongo code

module.exports = {readPlayersCharacters}