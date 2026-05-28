# Compendium Seed Runbook

Completes Phase 3: load rules data into MongoDB. Local fallback seed data now
includes Backgrounds and Conditions. Feats remain empty in fallback seed data
until ASI/feat selection is implemented; full 5etools import can still provide
Feats when `FIVETOOLS_DATA_DIR` is configured.

## Prerequisites

- Node version per `dndAPI/.nvmrc`.
- `dndAPI/.env` populated with: `ATLAS_CONNECTION`, `DB_NAME`, `ACCESS_SECRET_TOKEN`,
  `PORT`, `FIVETOOLS_DATA_DIR`.
- `FIVETOOLS_DATA_DIR` pointing at the 5etools `data` folder. Current value:
  `F:/Obsidian Valut/CLI/bin/5etools-src/data`. Confirm that folder exists and
  contains `backgrounds.json`, `feats.json`, and `conditionsdiseases.json`.

## Steps

1. `cd dndAPI`
2. `npm install`
3. `npm run seed`
   - Flow: `scripts/seed.js` -> `seeds/loadSeedData.js` -> tries
     `import5etools.js` first, falls back to static JSON if `FIVETOOLS_DATA_DIR`
     is unset or unreadable.
   - The seed wipes and reloads all 10 compendium collections. It does not touch
     the `Character` collection.
   - The command prints collection counts after seeding.

## Verification

1. Seed output should report non-zero counts for `Backgrounds` and
   `Conditions`. `Feats` may be `0` when using fallback seed data.
   Expected full-5etools counts: Backgrounds ~126, Feats ~226, Conditions ~15.
2. Start the API (`npm run dev`) and check the bootstrap endpoint:
   `curl http://localhost:5000/compendium/bootstrap`
   The JSON response must contain non-empty `backgrounds` and `conditions`
   arrays. `feats` is present and may be empty in fallback mode.
3. Run the backend test suite: `npm test`. Expected: all tests pass with no
   skipped roadmap seed tests.
   (Note: `mongodb-memory-server` downloads a MongoDB binary on first run; it
   needs network access to `fastdl.mongodb.org`.)

## If the seed falls back to static JSON

`seeds/loadSeedData.js` ships fallback arrays for Backgrounds and Conditions.
Feats intentionally remain empty until feat/ASI UI rules are implemented. Re-run
with `FIVETOOLS_DATA_DIR` set to get full imported data.

## Rollback

The seed is idempotent: it wipes and reloads compendium collections every run.
To revert to a prior state, re-run with the previous data source. No migration
or manual cleanup is required.
