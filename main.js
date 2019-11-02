const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 5000

let idCounter = 1;
// The "Database"
let contacts = [
    {
        id: 0,
        name: "Wes",
        phone: "867-5309",
        email: "wes@wes.wes"
    }
]

app.use(express.json())
app.use(cors())

app.get('/contacts', (req, res) => {
    res.send(contacts)
})

app.get('/contacts/:id', (req, res) => {
    const results = contacts.filter((contact) => contact.id == req.params.id)
    res.send(results)
})

// req.body Parsing
// Validate the input
// Push the input into the "Database"
// Send a Response
app.post('/contacts', (req, res) => {
    const contact = req.body
    contact.id = idCounter
    contacts.push(contact)
    idCounter++
    res.send(contact)
})

app.put('/contacts/:id', (req, res) => {
    const updatedContact = req.body
    contacts.forEach((contact, index) => {
        if(contact.id == req.params.id){
            updatedContact.id = parseInt(req.params.id)
            contacts[index] = updatedContact
        }
    })
    res.send(updatedContact)
})

app.patch('/contacts/:id', (req, res) => {
    let result = 'Nothing was Updated'
    contacts.forEach((contact, index) => {
        if(contact.id == req.params.id){
            // String Array of Request Body Properties Names
            const bodyKeys = Object.keys(req.body)
            bodyKeys.forEach(propName => {
                // Computed Property Names
                contacts[index][propName] = req.body[propName]
                result = contacts[index]
            })
        }
    })
    res.send(result)
})

app.delete('/contacts/:id', (req, res) => {
    const updatedContacts = contacts.filter((contact) => contact.id != req.params.id)
    contacts = updatedContacts
    res.send(`Deleted Contact with ID ${req.params.id}`)
})


app.listen(port, () => console.log(`Example app listening on port ${port}!`))
