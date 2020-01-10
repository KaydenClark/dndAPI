const MongoClient = require('mongodb').MongoClient;
require('dotenv').config()

const url = process.env.ATLAS_CONNECTION

const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}

const createUser = (username, pswd) => {
    // Use connect method to connect to the server
    let iou = new Promise ((resolve, reject) =>{

        MongoClient.connect(url, settings, (err, client) => {
            if(err){
                reject(err)
            }
            else { 
                console.log("Connected to server to add a user");
                const db = client.db(dbName);
                // Get the contacts collection
                const collection = db.collection('users');
                // Insert a document
                collection.insertMany(userName, hasedpswd, (err, result) => {
                    if(err){
                        reject(err)
                    }
                    else{
                        client.close();
                        resolve("Inserted a document into the collection");
                    }
                   
                });
            } 
        })
    });
    return iou
}

module.exports= {createUser}