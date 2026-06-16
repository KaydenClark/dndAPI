# dndAPI — Game Plan

**Last reviewed: 2026-06-15**

Forward-looking only. Completed work is in git history and `DM Workbook/Chat Handoffs/`. For full phase history, see `DM Workbook/GAME_PLAN_CC.md`.

---

## Current State

55 tests green. Full derivation engine working: ability scores, HP, AC, attacks, skills, saving throws, spell slots (full-caster / half-caster / pact), expertise, rest recovery, features, proficiencies, languages. 12 classes (L1-L20), 15 races, 91 spells static fallback — 558 spells / 2,967 features when 5etools importer is active. Background grants (skills, languages, tools) are merged in derivation but the merge path has no dedicated integration test. Phase 6D (feat/ASI) is blocked on design.

---

## Deferred — Do Not Start Without the Listed Prerequisite

| Item | Blocked on |
|---|---|
| Feat/ASI system (Phase 6D) | Written design doc answering the 4 questions below |
| Skill choice validation server-side | Phase 6D design (tied to ASI rules) |
| `CORS_ORIGIN` set for production | Deployment decision |

**Phase 6D requires answers to these before any code:**
1. Which levels trigger ASI vs. feat choice per class (Fighter/Rogue get extras)?
2. How are feat prerequisites enforced at the API boundary?
3. Ability score mutation model: does a feat's +1 STR modify `baseAbilityScores` and re-derive, or apply as a separate modifier?
4. Tool proficiency and language selection model (background and feat grants)?

---

## Next Tasks

1. **Write a failing integration test for background skill grants** — create a character with a background that has `skillProficiencies`, fetch it, assert those skills appear in the response `skillProficiencies`. No test currently covers this end-to-end path.

2. **Manual verification** — sign in, create a Warlock at L3 (verify pact slots show correct level + "Recovers on: short rest"), create a Paladin at L1 and L2 (verify 0 slots at L1, 2 at L2). This closes the Phase 7 manual verification TODO.

3. **Write the feat/ASI design doc** — answer the 4 questions above. This is a design task, not a coding task. Output should be a written spec before any Phase 6D implementation starts.

---

## Verification

- `npm test` after any route, middleware, derivation, or seed change — must stay 55/55 green.
- `npm run seed` after any seed file change — verify collection counts in output.
- Never start new feature work on a red baseline.
