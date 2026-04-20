# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

dndAPI is a Node.js/Express REST API for D&D 5e character management. It handles user auth, character creation, and a compendium of races/classes/spells/weapons/armor. The core value is automatic derivation of ~550 character stat fields from minimal player input (race, class, level, base ability scores, equipment choices).

## Commands

```bash
npm run dev     # Start with nodemon (auto-reload)
npm start       # Production start
npm test        # Run all tests (uses mongodb-memory-server, no external DB needed)
npm run seed    # Seed database with demo users, characters, and compendium data
```

No linter or formatter is configured.

## Architecture

### Layers

```
routes/          → Express route handlers (thin, delegate to DataAccess)
DataAccess/      → Repository pattern; all MongoDB reads/writes live here
services/        → Business logic (characterDerivation.js)
middleware/      → authenticate.js (JWT), asyncHandler.js (promise error wrapping)
db/mongo.js      → Shared MongoDB client with connection pooling and index setup
defaults/        → characterSheet.js: the blank character template
seeds/           → Seed data (JSON) + import5etools.js for larger compendium
```

### Request Flow

1. `main.js` creates the Express app and mounts routes from `routes/index.js`
2. Protected routes pass through `authenticate` middleware, which injects `req.user`
3. Route handlers call DataAccess functions directly (no service layer except for derivation)
4. `DataAccess/characters.js` calls `characterDerivation.js` on create and retrieve

### Character Derivation (`services/characterDerivation.js`)

This is the core engine. When a character is created or fetched, it:
- Fetches a `compendiumIndex` (in-memory Map built from the DB, cached via `getCompendiumIndex()`)
- Resolves race/class/subclass/equipment by ID (or name slug as fallback)
- Computes ability scores (base + racial bonuses), modifiers, proficiency bonus, HP, AC, attack rolls, skill checks, saving throws, spell slots, spell save DC

Compendium items are looked up by kebab-case ID (e.g., `"high-elf"`, `"fire-bolt"`). Name-slug fallback does case-insensitive matching.

### Authentication

- `POST /signUp` and `POST /signIn` are public
- All `/player` and `/compendium` routes require `Authorization: Bearer <token>`
- JWTs contain `{ email, userName }`, expire in 1 hour, signed with `ACCESS_SECRET_TOKEN`
- Character ownership is enforced by filtering all queries on `req.user.email`

### Database

- MongoDB via the official driver (no ORM/ODM)
- Single shared client in `db/mongo.js`; call `getDb()` to get the `Db` instance
- Unique indexes: `Users.email`, `Users.userName`, `Character.(email+characterName)`, all Compendium collections by `.id`
- Character collection uses `email + characterName` as the logical unique key

## Environment Variables

Copy `.env.example` to `.env`:

```
ATLAS_CONNECTION=mongodb://localhost:27017
ACCESS_SECRET_TOKEN=<jwt-secret>
DB_NAME=DragonsData
PORT=5000
FIVETOOLS_DATA_DIR=./vendor/5etools-data   # optional, for larger compendium
```

## Testing

Tests live in `test/api.test.js` and use Node's built-in `node:test` + `supertest`. `mongodb-memory-server` spins up an isolated DB per run — no external MongoDB required.

To run a single test file: `node --test test/api.test.js`

Test seed credentials: `aria@example.com`, `bran@example.com`, `dm@example.com` — all with password `Password123!`.

## Key Conventions

- **IDs are kebab-case slugs**: `"high-elf"`, `"evocation"`, `"fire-bolt"` — used across all compendium references
- **Ability codes**: `str`, `dex`, `con`, `int`, `wis`, `cha`
- **Modifier formula**: `Math.floor((score - 10) / 2)`
- **Spell slot keys**: `"cantrips"`, `"level_1"` … `"level_9"` with shape `{ slotTotal, slotsExpended, knownSpells[] }`
- **Error responses**: always `{ error: "message" }` JSON with appropriate HTTP status (400/401/403/404/409/500)
- **asyncHandler**: wrap every async route handler with this middleware to surface promise rejections to Express

## Seeding & 5e Tools Data

`npm run seed` loads the bundled JSON files in `seeds/`. For a larger compendium, place 5e Tools exports in `vendor/5etools-data/` (git-ignored) and set `FIVETOOLS_DATA_DIR`; then re-run seed. The importer (`seeds/import5etools.js`) filters for non-UA "classic" content and normalizes abbreviations.
