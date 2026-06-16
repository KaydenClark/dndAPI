# dndAPI — REST API Reference

Express + MongoDB backend for the D&D WebApp ("Players Digital Binder"). The API
handles user authentication, character CRUD, and a read-only compendium of D&D 5e
game data. Its defining feature is **server-side character derivation**: clients
send a small set of player choices (race, class, level, base ability scores,
equipment) and the API returns a fully computed character sheet — ability
modifiers, proficiency bonus, AC, HP, saving throws, skills, attacks, spell slots,
spell save DC, features, and more.

- **Base URL (local):** `http://localhost:5000`
- **Content type:** `application/json` for all requests and responses
- **Auth:** JWT Bearer tokens (see [Authentication](#authentication))
- **Machine-readable spec:** [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0)

---

## Table of contents

- [Conventions](#conventions)
- [Authentication](#authentication)
- [Error handling](#error-handling)
- [Endpoints](#endpoints)
  - [Health](#get--health-check)
  - [Sign up](#post-signup)
  - [Sign in](#post-signin)
  - [Compendium bootstrap](#get-compendiumbootstrap)
  - [List characters](#get-player)
  - [Create character](#post-player)
  - [Get character](#get-playercharacterid)
  - [Update character](#put-playercharacterid)
- [Schemas](#schemas)
  - [User](#user)
  - [Character (derived sheet)](#character-derived-sheet)
  - [Character summary](#character-summary)
  - [Bootstrap compendium](#bootstrap-compendium)
- [Data model](#data-model)
- [Configuration](#configuration)
- [CORS](#cors)

---

## Conventions

- All endpoints accept and return JSON. Send `Content-Type: application/json`.
- Successful responses wrap their payload in a named key: `{ user }`, `{ token }`,
  `{ character }`, `{ characters }`. The compendium bootstrap is the only endpoint
  that returns a bare top-level object.
- Errors always return `{ "error": "<message>" }`, optionally with a `details` field.
- Timestamps (`createdAt`, `updatedAt`) are ISO‑8601 strings.
- MongoDB `_id` values are returned as strings.

---

## Authentication

Authentication uses **JSON Web Tokens**. The flow is:

1. `POST /signUp` to create an account (returns the user, **no token**).
2. `POST /signIn` with the same credentials to receive a token.
3. Send the token on protected routes via the `Authorization` header:

   ```
   Authorization: Bearer <token>
   ```

Token details:

- Signed with the `ACCESS_SECRET_TOKEN` server secret.
- Payload: `{ "email": "...", "userName": "..." }`.
- **Expires after 1 hour.** Re-authenticate via `/signIn` to obtain a fresh token.

Protected routes are everything under `/player`. The middleware attaches the
decoded token to `req.user`, and character ownership is enforced by matching the
token's `email` against the stored character — you can only read or modify your
own characters.

| Condition | Status | Body |
|---|---|---|
| Missing / non-Bearer `Authorization` header | `401` | `{ "error": "Authorization token is required" }` |
| Invalid or expired token | `403` | `{ "error": "Authorization token is invalid" }` |

---

## Error handling

All errors share a consistent shape:

```json
{ "error": "Human-readable message", "details": { "optional": "context" } }
```

Common status codes used across the API:

| Status | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `400` | Validation error (missing/invalid fields) |
| `401` | Not authenticated (bad credentials or missing token) |
| `403` | Authenticated token rejected (invalid/expired) |
| `404` | Resource not found / route unknown (`{ "error": "Unknown request" }`) |
| `409` | Conflict (duplicate email, userName, or character name) |
| `500` | Server/configuration error (e.g. missing env var) |

---

## Endpoints

Route summary:

| Method | Path | Auth | Description |
|---|---|:---:|---|
| `GET` | `/` | — | Health check (pings the database) |
| `POST` | `/signUp` | — | Register a new user |
| `POST` | `/signIn` | — | Authenticate and receive a JWT |
| `GET` | `/compendium/bootstrap` | — | Slim compendium payload for client init |
| `GET` | `/player` | ✅ | List the caller's character summaries |
| `POST` | `/player` | ✅ | Create a character |
| `GET` | `/player/:characterId` | ✅ | Get one character (full derived sheet) |
| `PUT` | `/player/:characterId` | ✅ | Update a character (partial allowed) |

> **Note:** characters live under `/player`, not `/character`.

---

### `GET /` — health check

Pings MongoDB and confirms the API is up.

**Response `200`**

```json
{ "status": "ok" }
```

---

### `POST /signUp`

Register a new user. Email is trimmed and lowercased; userName is trimmed.

**Request body**

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `email` | string | ✅ | Stored lowercased |
| `userName` | string | ✅ | Must be unique |
| `password` | string | ✅ | Hashed with bcrypt (12 rounds). The legacy field name `hash` is also accepted as a fallback. |

```json
{ "email": "aria@example.com", "userName": "aria", "password": "Password123!" }
```

**Response `201`** — note there is **no token**; call `/signIn` next.

```json
{
  "user": {
    "_id": "665f1c...",
    "email": "aria@example.com",
    "userName": "aria",
    "role": "player",
    "playerIds": [],
    "dmCampaignIds": []
  }
}
```

**Errors**

| Status | When |
|---|---|
| `400` | `{ "error": "Email, userName, and password are required" }` |
| `409` | `{ "error": "email already exists" }` or `{ "error": "userName already exists" }` |

```bash
curl -X POST http://localhost:5000/signUp \
  -H 'Content-Type: application/json' \
  -d '{"email":"aria@example.com","userName":"aria","password":"Password123!"}'
```

---

### `POST /signIn`

Authenticate and receive a JWT valid for 1 hour.

**Request body**

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `email` | string | ✅ | Case-insensitive (lowercased before lookup) |
| `password` | string | ✅ | Legacy field name `hash` also accepted |

**Response `200`**

```json
{ "token": "eyJhbGciOiJIUzI1NiInR5cCI6..." }
```

**Errors**

| Status | When |
|---|---|
| `400` | `{ "error": "Email and password are required" }` |
| `401` | `{ "error": "Invalid email or password" }` |

```bash
curl -X POST http://localhost:5000/signIn \
  -H 'Content-Type: application/json' \
  -d '{"email":"aria@example.com","password":"Password123!"}'
```

---

### `GET /compendium/bootstrap`

Returns a slimmed-down projection of all compendium collections, sized for
client initialization (the character-creation wizard and trackers). Public — no
auth required. See [Bootstrap compendium](#bootstrap-compendium) for the shape.

**Response `200`**

```json
{
  "races": [{ "id": "human", "name": "Human", "speed": 30, "size": "Medium", "raceGroup": "Human" }],
  "classes": [{ "id": "fighter", "name": "Fighter", "primaryAbilities": ["str"], "skillChoiceRules": { "choose": 2, "options": ["athletics", "..."] }, "subclassLevel": 3 }],
  "subclasses": [{ "id": "champion", "classId": "fighter", "name": "Champion" }],
  "weapons": [{ "id": "longsword", "name": "Longsword", "category": "martial", "weaponType": "melee" }],
  "armor": [{ "id": "chain-mail", "name": "Chain Mail", "category": "heavy", "baseAc": 16 }],
  "spells": [{ "id": "fire-bolt", "name": "Fire Bolt", "level": 0, "classes": ["wizard"] }],
  "backgrounds": [{ "id": "sage", "name": "Sage", "source": "PHB", "skillProficiencies": ["arcana"], "languages": 2, "toolProficiencies": [] }],
  "feats": [{ "id": "alert", "name": "Alert", "source": "PHB", "prerequisite": null, "abilityBonus": null }],
  "conditions": [{ "id": "poisoned", "name": "Poisoned", "description": "A poisoned creature has disadvantage..." }]
}
```

---

### `GET /player`

🔒 List summaries of the authenticated user's characters, sorted by name.

**Response `200`**

```json
{
  "characters": [
    {
      "_id": "665f20...",
      "email": "aria@example.com",
      "userName": "aria",
      "characterName": "Thorin",
      "raceName": "Hill Dwarf",
      "className": "Fighter",
      "level": 3
    }
  ]
}
```

---

### `POST /player`

🔒 Create a character. The request supplies player choices; the response is the
fully [derived sheet](#character-derived-sheet). The owner is taken from the
token — any `email` in the body is ignored.

**Request body** (validated)

| Field | Type | Required | Rule |
|---|---|:---:|---|
| `characterName` | string | ✅ | Non-empty after trim; unique per user |
| `raceId` | string | ✅ | Non-empty; should match a compendium race `id` |
| `classId` | string | ✅ | Non-empty; should match a compendium class `id` |
| `level` | integer | ✅ | `1`–`20` |
| `baseAbilityScores` | object | optional | If present, must contain numeric `str, dex, con, int, wis, cha` |

Any other character-sheet fields (subclass, background, equipment, spells,
currency, conditions, roleplay text, etc.) may be included and will be merged and
re-derived. See the [Character schema](#character-derived-sheet) for the full set.

```json
{
  "characterName": "Thorin",
  "raceId": "hill-dwarf",
  "classId": "fighter",
  "level": 3,
  "baseAbilityScores": { "str": 15, "dex": 12, "con": 14, "int": 10, "wis": 13, "cha": 8 },
  "armorId": "chain-mail",
  "equippedWeaponIds": ["longsword"]
}
```

**Response `201`** — `{ "character": { ...derived sheet... } }`

**Errors**

| Status | When |
|---|---|
| `400` | Validation failed — e.g. `{ "error": "level must be an integer between 1 and 20" }` |
| `401` / `403` | Missing or invalid token |
| `409` | `{ "error": "Character name already exists for this user" }` |

```bash
curl -X POST http://localhost:5000/player \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"characterName":"Thorin","raceId":"hill-dwarf","classId":"fighter","level":3}'
```

---

### `GET /player/:characterId`

🔒 Fetch a single character by id. Re-derives and returns the full sheet. Only
the owner can access it.

**Response `200`** — `{ "character": { ...derived sheet... } }`

**Errors**

| Status | When |
|---|---|
| `404` | Not found, not owned by the caller, or `characterId` is not a valid ObjectId — all return `{ "error": "Character not found" }` |

---

### `PUT /player/:characterId`

🔒 Update a character. Validation is **partial** — only the fields present in the
body are validated (and an empty body `{}` is accepted, simply re-deriving the
sheet). The merged document is re-derived and returned.

Partial rules: when present, `characterName` must be non-empty, `raceId`/`classId`
non-empty, `level` an integer 1–20, and `baseAbilityScores` numeric for all six
abilities.

> **HP & hit dice:** if `maxHp`, `currentHp`, or `hitDiceRemaining` are omitted
> (and not already stored), they are computed from class/level/CON rather than
> overwritten. Send explicit values to override the derived defaults.

**Response `200`** — `{ "character": { ...derived sheet... } }`

**Errors**

| Status | When |
|---|---|
| `400` | A present field failed validation |
| `404` | Not found / not owned / invalid id |
| `409` | Rename collides with another of the user's characters |

```bash
curl -X PUT http://localhost:5000/player/665f20... \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"level":4,"currentHp":28}'
```

---

## Schemas

### User

Returned by `/signUp`. Sensitive fields (`hashedpass`) are never serialized.

| Field | Type | Description |
|---|---|---|
| `_id` | string | Mongo id |
| `email` | string | Unique, lowercased |
| `userName` | string | Unique display name |
| `role` | string | `"player"` (default) or `"dm"` |
| `playerIds` | string[] | Linked player/character references |
| `dmCampaignIds` | string[] | Campaigns the user runs as DM |

### Character (derived sheet)

The character document returned by all `/player` read/write endpoints. Player
**inputs** are a small subset (name, race/class ids, level, base ability scores,
equipment/spell/feature selections, roleplay text); the rest is **derived** on
every read and write and should be treated as read-only by clients.

| Field | Type | Source | Notes |
|---|---|---|---|
| `_id` | string | system | Present on stored characters |
| `email`, `userName` | string | owner | Set from the authenticated user |
| `characterName` | string | input | Unique per user |
| `raceId` / `raceName` | string | input / derived | Name resolved from compendium |
| `classId` / `className` | string | input / derived | |
| `subclassId` / `subclassName` | string | input / derived | |
| `background`, `alignment` | string | input | |
| `level` | int | input | 1–20 |
| `xp` | int | input | |
| `baseAbilityScores` | object | input | The six raw scores |
| `abilityScores` | object | derived | Base + racial/feat bonuses |
| `abilityMods` | object | derived | Modifier per ability |
| `proficiencyBonus` | int | derived | From level |
| `speed` | int | derived | From race |
| `passivePerception`, `initiative` | int | derived | |
| `maxHp`, `currentHp`, `tempHp` | int | derived/input | See HP note above |
| `hitDie`, `hitDiceRemaining` | string/int | derived | |
| `armorClass` | int | derived | From armor/shield/dex |
| `savingThrowProficiencies` | string[] | derived | From class |
| `savingThrows` | object | derived | Modifier per ability |
| `skillProficiencies`, `expertiseProficiencies` | string[] | input/derived | |
| `skillValues` | object | derived | Computed skill modifiers |
| `weaponProficiencies`, `armorProficiencies`, `toolProficiencies` | string[] | derived | |
| `languages` | string[] | derived | Race + background + chosen |
| `armorId`, `shieldId` | string\|null | input | |
| `equippedWeaponIds`, `availableWeaponIds` | string[] | input/derived | |
| `attacks` | object[] | derived | Attack/damage lines per equipped weapon |
| `spellcasting` | object | derived | `{ classId, ability, kind }` |
| `spellSlots` | object | derived | Per-level slot totals/expended + `cantrips` |
| `spellSaveDC`, `spellAttackBonus` | int\|null | derived | `null` for non-casters |
| `availableSpellIds`, `knownSpellIds`, `preparedSpellIds`, `cantripIds` | string[] | input/derived | |
| `resolvedSpells` | object | derived | `{ cantrips, known, prepared }` with full spell data + damage summaries |
| `conditions` | string[] | input | Active condition ids |
| `deathSaves` | object | input | `{ successes, failures }` |
| `currency` | object | input | `{ cp, sp, ep, gp, pp }` |
| `traits`, `ideals`, `bonds`, `flaws`, `backstory` | string | input | Roleplay text |
| `featureIds` / `features` | string[] / object[] | input/derived | Class/race/subclass features |
| `inventory`, `equipment` | object[] | input | Free-form items |
| `createdAt`, `updatedAt` | string | system | ISO‑8601 |

### Character summary

Returned by `GET /player` (list view): `_id`, `email`, `userName`,
`characterName`, `raceName`, `className`, `level`.

### Bootstrap compendium

`GET /compendium/bootstrap` returns each collection as an **array** of slim
records (only the fields the client needs up front). Projections:

| Collection | Fields returned |
|---|---|
| `races` | `id, name, speed, size, raceGroup` |
| `classes` | `id, name, primaryAbilities, skillChoiceRules, subclassLevel` |
| `subclasses` | `id, classId, name` |
| `weapons` | `id, name, category, weaponType` |
| `armor` | `id, name, category, baseAc` |
| `spells` | `id, name, level, classes` |
| `backgrounds` | `id, name, source, skillProficiencies, languages, toolProficiencies` |
| `feats` | `id, name, source, prerequisite, abilityBonus` |
| `conditions` | `id, name, description` |

The server also has an internal `getCompendiumIndex()` that loads the **full**
documents (as `Map`s keyed by `id`) for derivation; that richer data is not
exposed directly over HTTP.

---

## Data model

MongoDB database (default `DragonsData`). Collections and their key indexes:

| Collection | Purpose | Unique indexes |
|---|---|---|
| `Users` | Accounts | `email` (unique); `userName` (unique when no dupes exist, else lookup-only) |
| `Character` | Player characters | `email + characterName` (unique); `email` (lookup) |
| `Races`, `Classes`, `Subclasses`, `Spells`, `Weapons`, `Armor`, `Features`, `Backgrounds`, `Feats`, `Conditions` | Compendium | `id` (unique per collection) |

Each compendium document uses a stable string `id` field (not `_id`) as the
identifier referenced by characters. Indexes are created idempotently on startup
via `ensureIndexes()`.

---

## Configuration

Environment variables (see [`.env.example`](../.env.example)):

| Variable | Required | Default | Purpose |
|---|:---:|---|---|
| `ATLAS_CONNECTION` | ✅ | — | MongoDB connection string |
| `ACCESS_SECRET_TOKEN` | ✅ | — | JWT signing secret |
| `DB_NAME` | | `DragonsData` | Database name |
| `PORT` | | `5000` | HTTP port |
| `CORS_ORIGIN` | | _(empty)_ | Comma-separated allowed origins (see below) |
| `FIVETOOLS_DATA_DIR` | | — | Optional path to a 5etools dataset for richer seeding |

Missing a required variable surfaces as a `500` with a descriptive message
(e.g. `ATLAS_CONNECTION is required`).

## CORS

CORS is configured from `CORS_ORIGIN`:

- **Unset / empty** → permissive defaults (all origins allowed). Convenient for
  local development.
- **Set** → a comma-separated allowlist. Requests with no `Origin` header (e.g.
  curl, same-origin) are allowed; any other origin must be an exact match or the
  request is rejected by CORS.

For production, set `CORS_ORIGIN` to your deployed client origin(s).
