# dndAPI

Revived Express + MongoDB backend for the D&D WebApp.

## What Changed

- Replaced the old per-function Mongo connection pattern with a shared client in `db/`.
- Standardized auth and API responses around JSON and JWT middleware.
- Added compendium-backed character derivation for race, class, subclass, level, attacks, spell slots, spell save DC, and proficiencies.
- Added derivation support for background-granted skills, tools, languages, expertise, half-caster slots, and Warlock short-rest pact recovery.
- Added a seed pipeline that can load either:
  - the small built-in starter dataset under `seeds/*.json`
  - a larger local 5etools-compatible source folder via `FIVETOOLS_DATA_DIR`

## Local Setup

1. Create `.env` from `.env.example`
2. Set `ATLAS_CONNECTION`
3. Set `ACCESS_SECRET_TOKEN`
4. Run `npm install`
5. Run `npm run seed`
6. Run `npm run dev`

Default API port: `5000`

## Compendium Import

The API can import a much larger compendium from a local folder when `FIVETOOLS_DATA_DIR` is set.

Expected local structure:

```text
vendor/5etools-data/
  races.json
  items-base.json
  class/
  spells/
  generated/gendata-spell-source-lookup.json
```

The vendored compendium source is intentionally local-only and ignored by git.

## Seeded Demo Accounts

- `aria@example.com`
- `bran@example.com`
- `dm@example.com`

Password for the demo accounts: `Password123!`

## Validation

- `npm test`
- `npm run seed`

Current verified baseline as of 2026-06-04:

- `npm test`: 55 tests passing
- Atlas seed counts from the 2026-06-03 importer run: 165 races, 16 classes, 130 subclasses, 558 spells, 2967 features, 126 backgrounds, 178 feats, 15 conditions

