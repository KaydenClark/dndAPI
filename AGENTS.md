# dndAPI — Agent Instructions

You are working on the Express backend for a rules-accurate D&D 5e character sheet app. Read `BLUEPRINT.md` first — it tells you what we're building and what it looks like. This document tells you how to operate in this repo.

---

## Working Documents

Three documents orient you in this repo. Know how to use each one:

- **BLUEPRINT.md** — stable spec. What this service is, what every endpoint does, what the derivation engine computes. Rarely changes. Read it once at the start of a session.
- **GAME_PLAN.md** — forward-looking guide. Current state + next tasks. **This is a guide, not a constraint.** The code is ground truth. If the codebase contradicts the game plan, trust the code, flag the discrepancy, and update the plan before proceeding.
- **`DM Workbook/Chat Handoffs/`** — session history. Decisions made, context from previous sessions. Read the most recent one when picking up mid-project.

---

## Your Role

You write and maintain:
- Express routes and middleware (`routes/`, `middleware/`)
- The character derivation engine (`services/characterDerivation.js`)
- Data access layer (`DataAccess/`)
- Seed data and the import pipeline (`seeds/`, `scripts/`)
- Backend tests (`test/`)

You do not touch `dndclient/` (frontend) or `DM Workbook/` (separate app). Those are separate repos with separate agents.

---

## Stack Rules

- **Node.js + Express 4.** No framework changes.
- **MongoDB via the native driver.** No Mongoose. Use `DataAccess/` wrappers for all DB operations.
- **JWT (`jsonwebtoken` + `bcryptjs`).** Do not change the auth mechanism.
- **Node built-in test runner + supertest + mongodb-memory-server.** Do not introduce Jest or Mocha.
- **No new npm dependencies** without stating what they do and why they're needed. Check `package.json` before reaching for a new package.

---

## TDD — Required, No Exceptions

Every feature and bug fix follows this cycle:

1. **Red.** Write a failing test that describes the expected behavior in plain terms. Run `npm test` and confirm it fails for the right reason — not a syntax error, but because the behavior isn't there yet.
2. **Green.** Write the minimum code to make it pass. No adjacent features.
3. **Refactor.** Clean up while tests stay green. Do not change behavior.
4. **Full suite green** before committing.

**Test locations:**

| Change type | Test file |
|---|---|
| API route or middleware change | `test/api.test.js` |
| Derivation engine change | `test/derivation.test.js` |
| Seed or compendium change | `test/api.test.js` + manual `/compendium/bootstrap` check |

**Current baseline: 55 tests green.** Never start work on a red baseline. Fix it first.

Backend tests use `mongodb-memory-server` — they do not need Atlas running.

---

## The Derivation Engine Is Untouchable Without a Test

`services/characterDerivation.js` is the core of this entire service. Before modifying it:

1. Read `BLUEPRINT.md` sections "The Derivation Engine" and "What It Looks Like When Complete".
2. Read the full `characterDerivation.js` file.
3. Write a failing test in `test/derivation.test.js` that proves the expected behavior.
4. Make the smallest correct change.
5. Run full suite — confirm no regressions.

D&D math lives here and only here. If a route needs a derived value, it calls `buildCharacterDocument()`. Never compute D&D math in a route, data access file, or anywhere outside this engine.

---

## Code Standards

- Single file when possible. Split only when a file exceeds ~300 lines or separation is clearly necessary.
- All async route handlers wrapped in `asyncHandler` middleware. No unhandled promise rejections.
- All async calls use try/catch with visible error handling.
- No placeholder TODO blocks without a comment explaining what goes there and why it was deferred.
- `camelCase` for variables and functions. `PascalCase` for classes (rare in this codebase).
- Consistent error responses: use Express error handler, not ad-hoc `res.status(500).json(...)` in every route.

---

## Seed Data Rules

- `npm run seed` wipes and reloads all 10 compendium collections. It does **not** touch `Character`.
- Static JSON fallback files (`seeds/*.json`) are maintained for environments without 5etools access.
- Use Azlemzyk-accurate names in seed data only if the data is DM Workbook specific. Character creator seeds use real D&D 5e SRD data.
- After any seed change: run `npm run seed`, verify collection counts in output, confirm `npm test` still green.

---

## Day-One Checklist

1. Read `BLUEPRINT.md` completely.
2. Read `GAME_PLAN.md` for current state and immediate next tasks.
3. Read `services/characterDerivation.js` in full.
4. Check git branch: `git branch`. Ask Kayden which branch is active if unclear.
5. Confirm `.env` exists and is populated. Ask Kayden for `ATLAS_CONNECTION` and `ACCESS_SECRET_TOKEN` if missing.
6. `npm install && npm test` — must be 55/55 green before touching anything.
7. `npm run seed` — verify output shows all collections with expected counts.
8. `npm run dev` — confirm server starts on port 5000 and `GET /` returns `{ status: 'ok' }`.

---

## What NOT to Do

- Do not store derived stats in the database.
- Do not implement D&D math anywhere except `services/characterDerivation.js`.
- Do not add a new route without a test for it.
- Do not ship `cors()` with no origin restriction — use `CORS_ORIGIN` env var.
- Do not `npm run seed` in a way that touches the `Character` collection.
- Do not start feature work on a red test baseline.
- Do not introduce a new npm dependency without flagging it.
- Do not mix DM Workbook code into this service.
