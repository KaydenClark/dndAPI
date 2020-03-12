const MongoClient = require('mongodb').MongoClient;
// const ObjectId = require("mongodb").ObjectId;
require('dotenv').config()


// Connection URL
const url = process.env.ATLAS_CONNECTION

// Database Name
const dbName = 'DragonsData';
const settings = {
    useUnifiedTopology: true
}


const newUserCheck = (userName, email) => {
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
                const collection = db.collection('Users');
                // Insert a document
                collection.find({"userName": userName, "email": email}).toArray(function (err, docs) {
                    if(err){
                        reject(err)
                    }else{
                        console.log(docs.length)
                        if(docs.length > 1){
                            console.log("user and password Found")
                            resolve(true)
                            // if(docs.length > 1){
                            //     console.log("other user or password found")
                                
                            // }
                        } else{
                            console.log("no record")
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

module.exports = {newUserCheck}