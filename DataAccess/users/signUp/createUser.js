const MongoClient = require('mongodb').MongoClient;
const bcrypt = require('bcrypt')
const saltRounds = 13
require('dotenv').config()

const url = process.env.ATLAS_CONNECTION

const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}

const createUser = (userName, pswd) => {
    // Use connect method to connect to the server
    let iou = new Promise ((resolve, reject) =>{

        MongoClient.connect(url, settings, (err, client) => {
            if(err){
                reject(err)
            }
            else { 
                console.log("Connected to server to add a user");
                bcrypt.genSalt(saltRounds, (err, salt) =>{
                    bcrypt.hash(pswd, salt, (err, hash) =>{
                        let hashedpass = hash
                        const db = client.db(dbName);
                        // Get the contacts collection
                        const collection = db.collection('Users');
                        // Insert a document
                        collection.insertOne({userName, hashedpass}, (err, result) => {
                            if(err){
                                reject(err)
                            }
                            else{
                                client.close();
                                resolve("Inserted a document into the collection");
                            }
                           
                        });
                    })
                })
            } 
        })
    });
    return iou
}

module.exports= {createUser}