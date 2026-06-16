# dndAPI — Blueprint

**Last reviewed: 2026-06-15**

This document tells you exactly what this service is, what it does, what it should look like when complete, and what's left to build. Read this before touching any code.

---

## What This Service Is

A REST API for a rules-accurate D&D 5e character sheet app. The core promise:

> "Tell me exactly how much damage my sword does per swing based on my stats. Tell me what I'm proficient with based on what I selected during character creation."

The API takes raw player choices (race, class, level, ability scores, equipment) and returns a fully derived character — attack bonuses, AC, HP, spell slots, skills, saving throws, proficiencies, features. All of it computed fresh on every request. No derived stats are stored.

This service is **the only place D&D math lives.** The frontend submits choices and renders results. It never re-implements rules.

---

## What It Looks Like When Complete

A player opens the app, signs in, and picks their character. The sheet instantly shows:

- Attack cards: "Longsword +5 to hit / 1d8+3 slashing — Proficient" — derived from STR mod + proficiency bonus, not typed by the player
- Skills: all 18, each showing its modifier broken down by ability mod + proficiency + expertise
- HP bar: current/max with quick +/- controls
- Spell slots: remaining/total per level, short-rest or long-rest recovery label
- Conditions: toggle from compendium list, tooltip shows condition description
- Death saves, hit dice, inventory: tracked without opening an edit form

None of that math lives in the client. Every number comes from this service.

The server has one job: given a character document and the compendium, build the full derived output. It does this on every create, read, and update.

---

## Architecture

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js | See `.nvmrc` for version |
| Framework | Express 4 | REST only |
| Database | MongoDB Atlas | Cluster: `dndapi.p7im0tj.mongodb.net`, DB: `DragonsData` |
| Auth | JWT via `jsonwebtoken` + `bcryptjs` | Bearer tokens; no sessions |
| Test runner | Node built-in `--test` + supertest + mongodb-memory-server | Tests do not need Atlas |
| Dev server | nodemon | Port 5000 |

---

## Directory Map

```
dndAPI/
├── main.js                     ← entry: calls createApp(), starts on PORT
├── app.js                      ← factory: cors/json/routes/error handler
├── routes/
│   ├── index.js                ← root router: /signIn /signUp /compendium /player
│   ├── users/
│   │   ├── signIn.js           ← POST /signIn → JWT
│   │   └── signUp.js           ← POST /signUp → creates user
│   ├── compendium.js           ← GET /compendium/bootstrap
│   └── character/
│       └── character.js        ← /player CRUD (auth required)
├── DataAccess/
│   ├── compendium.js           ← DB reads for all compendium collections
│   ├── characters.js           ← character CRUD, calls derivation on every op
│   └── users.js                ← user lookup/create
├── services/
│   └── characterDerivation.js  ← THE ENGINE — read this before touching any character code
├── defaults/
│   └── characterSheet.js       ← empty character shape; merged as base on create/update
├── middleware/
│   ├── authenticate.js         ← JWT verify; attaches req.user
│   └── asyncHandler.js         ← wraps async handlers, forwards errors
├── db/
│   └── mongo.js                ← singleton MongoClient, ensureIndexes(), pingDb()
├── seeds/
│   ├── import5etools.js        ← reads 5etools JSON, transforms to app schema
│   ├── loadSeedData.js         ← orchestrates: 5etools first, JSON fallbacks second
│   ├── classes.json            ← 12 classes, L1-L20 progression
│   ├── races.json              ← 15 races with raceGroup for subrace grouping
│   ├── spells.json             ← 91 spells, all levels 0-9, all caster classes
│   ├── subclasses.json         ← 12 subclasses (one per class)
│   ├── armor.json
│   ├── features.json
│   ├── weapons.json
│   └── users.json              ← seed test accounts
├── scripts/
│   └── seed.js                 ← npm run seed: wipes and reloads all compendium collections
└── test/
    ├── api.test.js             ← integration tests (in-memory MongoDB via mongodb-memory-server)
    └── derivation.test.js      ← unit tests for characterDerivation.js
```

---

## API Contract

Base URL: `http://localhost:5000` (dev)

### Public Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/` | — | `{ status: 'ok' }` — DB health check |
| POST | `/signUp` | `{ email, userName, password }` | `{ user }` |
| POST | `/signIn` | `{ email, password }` | `{ token, user }` |
| GET | `/compendium/bootstrap` | — | Slim compendium for frontend dropdowns |

Bootstrap response shape:
```js
{
  races: [{ id, name, speed, size, raceGroup, abilityBonuses }],
  classes: [{ id, name, primaryAbilities, hitDie, subclassLevel, spellcasting }],
  subclasses: [{ id, classId, name }],
  weapons: [{ id, name, category, weaponType }],
  armor: [{ id, name, category, baseAc }],
  spells: [{ id, name, level, classes }],
  backgrounds: [{ id, name, source, skillProficiencies, languages, toolProficiencies }],
  feats: [{ id, name, source, prerequisite, abilityBonus }],
  conditions: [{ id, name, description }]
}
```

### Protected Routes (JWT Bearer required)

All under `/player`, scoped to the authenticated user's email.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/player` | — | `{ characters: [summary...] }` |
| POST | `/player` | `{ characterName, raceId, classId, level, baseAbilityScores, ... }` | `{ character }` (full derived) |
| GET | `/player/:characterId` | — | `{ character }` (full derived) |
| PUT | `/player/:characterId` | any character fields (partial ok) | `{ character }` (full derived) |

**Critical rule:** Every read and write calls `buildCharacterDocument()`. Raw inputs are persisted. Derived stats are never stored — they are computed fresh on every response.

---

## The Derivation Engine

`services/characterDerivation.js` is the core of this service. **Read the full file before touching any character-related route, data access, or seed.**

The engine receives `(character, compendium)` and returns a fully derived character document. Computation order:

1. Race, class, subclass lookup from compendium Maps (by id, falls back to name-slug match)
2. Base ability scores normalized from input
3. Ability scores = `baseAbilityScores` + racial `abilityBonuses`
4. Ability modifiers = `floor((score - 10) / 2)` per stat
5. Proficiency bonus = `2 + floor((level - 1) / 4)`
6. Feature IDs = union of race features + class level progression + subclass level features
7. Weapon/armor proficiencies = union of race + class + character overrides
8. Saving throws = modifier + proficiency bonus if proficient
9. Skills (18 total) = relevant ability mod + proficiency bonus if proficient + double proficiency if expertise
10. HP = class hit die + CON mod (L1) + average roll per level thereafter; Dwarven Toughness adds +level
11. AC = 10 + DEX mod (unarmored), or armor's `baseAc` + DEX mod (capped by `dexCap`), + shield bonus
12. Initiative = DEX modifier
13. Passive Perception = 10 + WIS mod + proficiency bonus (doubled if expertise) if Perception proficient
14. Attacks = for each `equippedWeaponId`: attack bonus, damage string, proficiency flag
15. Spell slots = from class `spellSlotsByLevel[level]` table — handles full-caster, half-caster, and Warlock pact slots identically
16. Spell save DC = 8 + proficiency bonus + spellcasting ability mod
17. Spell attack bonus = proficiency bonus + spellcasting ability mod
18. Available spells = filtered by class and max castable spell level at current level
19. Languages = race languages + background languages (deduplicated, "Choice" excluded)

**Weapon attack ability selection:**
- Ranged weapon → DEX
- Finesse weapon → whichever of STR or DEX is higher
- All others → STR

**Spell slot types — handled by `spellSlotsByLevel` table, not special-cased:**
- Full-casters (Bard, Cleric, Druid, Sorcerer, Wizard): slots start at level 1
- Half-casters (Paladin, Ranger): slots start at level 2 (first two levels have empty slot objects)
- Warlock: `kind: "pact"` — pact slot level scales with character level; `restRecovery: "short"`
- All others: `restRecovery: "long"`

**Current derivation gaps — not yet enforced:**
- Feat prerequisites: parsed as display text only, not enforced at the API boundary
- Skill choice validation: engine applies any skill in `skillProficiencies[]`; does not validate against `class.skillChoiceRules`
- Background grants: `effectiveSkillProficiencies` merges background-granted skills, but this path lacks a dedicated end-to-end test

**Input shape for `buildCharacterDocument(character, compendium)`:**
```js
{
  raceId, classId, subclassId,
  level,                                        // 1-20
  baseAbilityScores: { str, dex, con, int, wis, cha },
  skillProficiencies: ['perception', ...],
  expertiseProficiencies: ['stealth', ...],     // double proficiency on chosen skills
  equippedWeaponIds: ['longsword', ...],
  armorId, shieldId,
  cantripIds, knownSpellIds, preparedSpellIds,
  spellSlots: { level_1: { slotsExpended }, ... },
  conditions, deathSaves, currency,
  traits, ideals, bonds, flaws, backstory,
  inventory, equipment
}
```

---

## MongoDB Collections

Database: `DragonsData`

| Collection | Key fields |
|---|---|
| `Users` | `email` (unique), `userName` (unique), `passwordHash` |
| `Character` | `email` (owner), `characterName` (unique per email), all raw inputs + derived output |
| `Races` | `id`, `name`, `raceGroup`, `abilityBonuses`, `weaponProficiencies`, `featureIds`, `speed`, `languages` |
| `Classes` | `id`, `name`, `hitDie`, `subclassLevel`, `savingThrowProficiencies`, `armorProficiencies`, `weaponProficiencies`, `skillChoiceRules`, `spellcasting`, `levelProgression`, `spellSlotsByLevel` |
| `Subclasses` | `id`, `classId`, `name`, `levelFeatures` |
| `Spells` | `id`, `name`, `level`, `classes[]`, `damage`, `scaling`, `school`, `range`, `duration`, `components` |
| `Weapons` | `id`, `name`, `category`, `weaponType`, `damageDice`, `damageType`, `finesse`, `range`, `properties` |
| `Armor` | `id`, `name`, `category`, `baseAc`, `dexCap` |
| `Features` | `id`, `name`, `description` |
| `Backgrounds` | `id`, `name`, `source`, `skillProficiencies`, `languages`, `toolProficiencies` |
| `Feats` | `id`, `name`, `source`, `prerequisite`, `abilityBonus` |
| `Conditions` | `id`, `name`, `description` |

Indexes created at startup (`ensureIndexes`):
- `Users.email` unique
- `Users.userName` unique
- `Character.email` lookup
- `Character.{email, characterName}` unique
- All 10 compendium collections: `id` unique

---

## Data Pipeline

```bash
cd dndAPI && npm run seed
```

Flow: `scripts/seed.js` → `seeds/loadSeedData.js` → tries `import5etools.js` first → falls back to static JSON files → wipes and reloads all 10 compendium collections → seeds test users. Does **not** touch the `Character` collection.

5etools path (from `dndAPI/.env`):
```
FIVETOOLS_DATA_DIR=F:/Obsidian Valut/CLI/bin/5etools-src/data
```

**Static fallback counts** (what runs without 5etools):
- 12 classes (full L1-L20 progression), 15 races, 12 subclasses, 91 spells, 245 features, 15 conditions, 126 backgrounds

**With 5etools active** (Atlas seed run 2026-06-03):
- 165 races, 16 classes, 130 subclasses, 558 spells, 2,967 features, 178 feats, 126 backgrounds, 15 conditions

---

## Character Document — Field Groups

The persisted `Character` document stores both raw inputs and the derived output. On every create/update/fetch the backend rebuilds from: owner identity + stored fields + incoming payload + compendium rules + default sheet shape.

| Group | Fields |
|---|---|
| Identity | `email`, `userName`, `characterName` |
| Core choices | `raceId`, `classId`, `subclassId`, `background`, `alignment`, `level`, `xp` |
| Abilities | `baseAbilityScores`, `abilityScores` (with racial bonuses applied), `abilityMods` |
| Derived combat | `proficiencyBonus`, `armorClass`, `initiative`, `speed`, `maxHp`, `currentHp`, `tempHp`, `hitDie`, `hitDiceRemaining` |
| Proficiencies | `savingThrowProficiencies`, `skillProficiencies`, `expertiseProficiencies`, `weaponProficiencies`, `armorProficiencies`, `toolProficiencies`, `languages` |
| Equipment | `armorId`, `shieldId`, `equippedWeaponIds`, `availableWeaponIds`, `attacks`, `inventory`, `equipment` |
| Spells | `spellcasting` (incl. `restRecovery`), `spellSlots`, `spellSaveDC`, `spellAttackBonus`, `availableSpellIds`, `knownSpellIds`, `preparedSpellIds`, `cantripIds`, `resolvedSpells` |
| Session state | `conditions`, `deathSaves`, `currency` |
| Narrative | `traits`, `ideals`, `bonds`, `flaws`, `backstory` |
| Features | `featureIds`, `features` |

---

## What's Built

- User sign-up, sign-in with JWT; ownership-scoped character CRUD
- Full derivation engine: ability scores/mods, proficiency bonus, HP, AC, initiative, speed, passive perception, attacks (damage strings + proficiency flags), all 18 skills, saving throws, spell slots (full-caster / half-caster / pact), spell save DC, spell attack bonus, available spells, features, weapon/armor/tool/language proficiencies
- Expertise: double proficiency on chosen skills, updates passive Perception correctly
- `spellcasting.restRecovery`: "short" for Warlock, "long" for all others
- Background grants: skill/language/tool proficiencies merged in derivation
- CORS lockable via `CORS_ORIGIN` env var
- `/compendium/bootstrap` returning all 10 collections including backgrounds, feats, conditions
- `raceGroup` field on races for subrace grouping in the frontend wizard
- `subclassLevel` field on classes for early-gate UI
- 55 green backend tests

---

## What's Not Built Yet

- **Feat prerequisites enforced at API boundary** — Phase 6D, requires design doc first (see GAME_PLAN.md)
- **Skill choice validation server-side** — engine accepts any skill; `skillChoiceRules` is not enforced
- **Background grants end-to-end test** — the merge logic exists but has no dedicated integration test proving it round-trips correctly
- **ASI/feat system** — blocked on design: which levels trigger ASI vs. feat, prerequisite check system, ability score mutation model
- **CORS_ORIGIN set for production** — use env var; do not ship with wildcard CORS

---

## Environment

Required `.env` keys:
```
ATLAS_CONNECTION=mongodb+srv://...@dndapi.p7im0tj.mongodb.net/
DB_NAME=DragonsData
ACCESS_SECRET_TOKEN=<jwt secret — ask Kayden>
PORT=5000
CORS_ORIGIN=http://localhost:5173
FIVETOOLS_DATA_DIR=F:/Obsidian Valut/CLI/bin/5etools-src/data
```

---

## Key Design Decisions

**Why re-derive on every read/write?** The character sheet is a pure function of inputs + compendium data. Storing derived stats would require cache invalidation on every compendium update. Deriving fresh on every API call is cheap (~1ms) and keeps the DB clean.

**Why MongoDB instead of SQL?** The character document is deeply nested and varies by class/race combination. Document storage avoids a painful multi-table join for every character fetch and maps naturally to the sheet's shape.

**Why JWT and not sessions?** Stateless auth keeps the API horizontally scalable and avoids session store management. Single-user-per-account scope makes token invalidation concerns minimal.

**Why keep derivation server-side?** D&D math has interdependencies: racial bonuses feed ability mods, which feed attack bonuses, which feed damage strings. Keeping it in one place ensures consistency. The client must never re-implement rules.
