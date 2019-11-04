const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000
const monsters = require('./dnd_5e/monsters.json')

let idCounter = 1;
// The "Database"
// let monsters = [
//     {
//         number: "0",
//         name: "Name",
//         meta: "Size, Alignment",
//         armorClass: "AC (Type)",
//         hitPoints: "HP (HitDice)",
//         speed: "Speed",
//         str: "STR",
//         str_mod: "(str_mod)",
//         dex: "DEX",
//         dex_mod: "(dex_mod)",
//         con: "CON",
//         con_mod: "(con_mod)",
//         int: "INT",
//         int_mod: "(int_mod)",
//         wis: "WIS",
//         wis_mod: "(wis_mod)",
//         cha: "CHA",
//         cha_mod: "(cha_mod)",
//         savingThrows: "throw1 (mod), throw2 (mod)",
//         skills: "skill (mod)",
//         senses: "passive (mod), other",
//         languages: "language1, language2",
//         challenge: "rate (XP)",
//         traits: "<p><em><strong>trait</strong></em> Description </p>",
//         actions: "<p><em><strong>action</strong></em> Description </p>",
//         legendaryActions: "<p><em><strong>trait</strong></em> Description </p>",
//         img_url: "url"
//       },
// ]

app.use(express.json())
app.use(cors())

app.get('/monsters', (req, res) => {
    res.send(monsters)
})

app.get('/monsters/:id', (req, res) => {
    const results = monsters.filter((monster) => monster.id == req.params.id)
    res.send(results)
})

app.get('/monsters/list', (req, res) => {
    const list = import(monsters.json)
    res.send(list)
})

// req.body Parsing
// Validate the input
// Push the input into the "Database"
// Send a Response
app.post('/monsters', (req, res) => {
    const monster = req.body
    monster.id = idCounter
    monsters.push(monster)
    idCounter++
    res.send(monster)
})

app.put('/monsters/:id', (req, res) => {
    const updatedMonster = req.body
    monsters.forEach((monster, index) => {
        if(monster.id == req.params.id){
            updatedMonster.id = parseInt(req.params.id)
            monsters[index] = updatedMonster
        }
    })
    res.send(updatedMonster)
})

app.patch('/monsters/:id', (req, res) => {
    let result = 'Nothing was Updated'
    monsters.forEach((monster, index) => {
        if(monster.id == req.params.id){
            // String Array of Request Body Properties Names
            const bodyKeys = Object.keys(req.body)
            bodyKeys.forEach(propName => {
                // Computed Property Names
                monsters[index][propName] = req.body[propName]
                result = monsters[index]
            })
        }
    })
    res.send(result)
})

app.delete('/monsters/:id', (req, res) => {
    const updatedContacts = monsters.filter((monster) => monster.id != req.params.id)
    monsters = updatedContacts
    res.send(`Deleted monster with ID ${req.params.id}`)
})


app.listen(port, () => console.log(`Example app listening on port ${port}!`))
