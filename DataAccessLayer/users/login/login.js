const MongoClient = require('mongodb').MongoClient;
const jwt = require('json-web-token')
const bcrypt = require('bcrypt')
require('dotenv').config()


// Connection URL
const url = process.env.ATLAS_CONNECTION

// Database Name
const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}


const validateUser = (userName, hashedpswd) => {
    // Use connect method to connect to the server
    let iou = new Promise ((resolve, reject) =>{

        MongoClient.connect(url, settings, function (err, client) {
            if(err){
                reject(err)
            }
            else { 
                console.log("Connected to server for Creation of Contact");
                const db = client.db(dbName);
                // Get the contacts collection
                const collection = db.collection('users');
                // Insert a document
                collection.find({"userName": userName}).toArray(async function (err, docs) {
                    if(err){
                        reject(err)
                    }else{
                        if(docs.length > 0){
                            const passValid = await bcrypt.compare(hashedpswd, docs[0].hashedpass)
                                .then(function(res){return res})
                            if(passValid){
                                console.log('passmatch')
                                resolve(true)
                            } else {
                                console.log('no match')
                                resolve(false)
                            }
                            // console.log(docs[0].hashedpass)
                        } else{
                            resolve(false)
                        }
                        client.close();
                    }
                });
            } 
        })
    });
    return iou
}

module.exports = {validateUser}