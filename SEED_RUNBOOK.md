# Compendium Seed Runbook

Completes Phase -1 / Milestone 0: load full rules data (including Backgrounds,
Feats, Conditions) into MongoDB Atlas. This must be run from a machine with
network access to Atlas and access to the 5etools data source. It cannot run
from the Cowork sandbox (Atlas DNS is not on the network allowlist, and the
5etools source drive is not mounted).

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

## Verification

1. Seed output should report non-zero counts for `Backgrounds`, `Feats`, and
   `Conditions`. Expected full-5etools counts: Backgrounds ~126, Feats ~226,
   Conditions ~15.
2. Start the API (`npm run dev`) and check the bootstrap endpoint:
   `curl http://localhost:5000/compendium/bootstrap`
   The JSON response must contain non-empty `backgrounds`, `feats`, and
   `conditions` arrays.
3. Run the backend test suite: `npm test`. Expected: 13/13 pass.
   (Note: `mongodb-memory-server` downloads a MongoDB binary on first run; it
   needs network access to `fastdl.mongodb.org`.)

## If the seed falls back to static JSON

`seeds/loadSeedData.js` ships empty stub arrays for Backgrounds, Feats, and
Conditions. If the seed runs without `FIVETOOLS_DATA_DIR`, those three
collections will be created but empty. That is expected and not an error, but it
means the bootstrap arrays will be empty and any UI depending on them will show
its empty state. Re-run with `FIVETOOLS_DATA_DIR` set to get real data.

## Rollback

The seed is idempotent: it wipes and reloads compendium collections every run.
To revert to a prior state, re-run with the previous data source. No migration
or manual cleanup is required.
