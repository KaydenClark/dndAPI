# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Express.js + MongoDB REST API backend for a D&D character management web app ("Players Digital Binder"). Handles authentication, character CRUD, and a compendium of D&D 5e game data (races, classes, spells, weapons, etc.).

For the full HTTP contract (endpoints, request/response schemas, status codes), see [`docs/API.md`](./docs/API.md) and the OpenAPI spec at [`docs/openapi.yaml`](./docs/openapi.yaml).

## Commands

```bash
# Start dev server (auto-restart on changes)
npm run dev

# Run production server
npm start

# Run all tests
npm test

# Run a single test file
node --test test/derivation.test.js

# Seed the database (wipes and reloads all data)
npm run seed
```

**Node version:** v20 (see `.nvmrc`)

**Required environment variables** (see `.env.example`):
- `ATLAS_CONNECTION` – MongoDB connection string
- `ACCESS_SECRET_TOKEN` – JWT signing secret
- `DB_NAME` – database name (default: `DragonsData`)
- `PORT` – server port (default: `5000`)
- `FIVETOOLS_DATA_DIR` – optional path to 5etools data for richer compendium seeding

## Architecture

### Request Flow

```
routes/ → DataAccess/ → db/mongo.js
              ↓
         services/characterDerivation.js  (for character reads/writes)
```

- **`app.js`** – Express factory: mounts middleware, routes, and 404/error handlers. Calls `ensureIndexes()` at startup.
- **`main.js`** – Entry point: loads `.env`, creates the app, starts the HTTP server.
- **`db/mongo.js`** – Singleton MongoDB client. `ensureIndexes()` creates all collection indexes on boot.
- **`routes/index.js`** – Mounts all route handlers; public vs. protected routes are clearly separated here.
- **`DataAccess/`** – All database interaction lives here (`characters.js`, `users.js`, `compendium.js`). Routes should never call `db/mongo.js` directly.
- **`services/characterDerivation.js`** – Derives all computed stats (ability modifiers, proficiency bonus, AC, spell slots, attacks, features) from a character's base data + compendium entries. Called on every character read and write.
- **`defaults/characterSheet.js`** – The canonical schema/default values for a character document.
- **`middleware/`** – `authenticate.js` (JWT validation, attaches `req.user`) and `asyncHandler.js` (wraps async handlers to forward errors).

### Authentication

JWT Bearer tokens issued at sign-in (1h expiry). Protected routes use the `authenticate` middleware, which attaches `{ email, role }` to `req.user`. Routes verify ownership by comparing `req.user.email` against stored character email.

### Character Derivation

Every character PUT/POST passes through `characterDerivation.js` before being stored, and the derived document is always returned to the client. The service fetches compendium documents by ID (race, class, subclass, weapons, spells, etc.) and computes the full derived sheet. When editing this service, be aware that it hydrates `resolvedSpells`, `features`, `attacks`, and `savingThrows` from compendium data—changes to compendium document shape will ripple here.

### Compendium Data

MongoDB collections: `Races`, `Classes`, `Subclasses`, `Spells`, `Weapons`, `Armor`, `Features`, `Backgrounds`, `Feats`, `Conditions`. Each uses a unique `id` field (not `_id`) as the stable identifier referenced by character documents. The `GET /compendium/bootstrap` endpoint returns a slimmed-down version of all collections for frontend initialization.

### Error Handling Convention

Throw plain `Error` objects with `.statusCode` and optionally `.details` to control the HTTP response. The centralized error handler in `app.js` reads these properties. The `asyncHandler` wrapper ensures unhandled promise rejections reach the error handler.

### API Response Shape

All responses wrap the payload: `{ character }`, `{ characters }`, `{ user }`, `{ token }`. Errors return `{ error, details? }`.

## Testing

Tests use Node.js's built-in `node:test` runner with `supertest` for HTTP assertions and `mongodb-memory-server` for an isolated in-memory MongoDB instance. There is no separate config file—setup/teardown is handled via `before`/`after` hooks inside each test file.

- `test/api.test.js` – Integration tests covering all routes end-to-end
- `test/derivation.test.js` – Unit tests for `characterDerivation.js`
- `test/support.test.js` – Tests for utility/validation helpers
- `test/dataAccess.test.js` – Tests for the `DataAccess/` layer against in-memory Mongo
- `test/mongo.test.js` – Tests for the `db/mongo.js` connection/index helpers
- `test/validation.test.js` – Tests for character payload validation

All 132 tests should pass (as of 2026-06-15). Run individual files with `node --test test/<file>`.

## Seeding

`npm run seed` wipes all compendium collections and reloads from `seeds/*.json`. If `FIVETOOLS_DATA_DIR` is set, `seeds/import5etools.js` will import richer data from the 5etools dataset instead. The seed script is idempotent and also creates demo user accounts (`aria@example.com`, `bran@example.com`, `dm@example.com` / `Password123!`). See `SEED_RUNBOOK.md` for full details.
