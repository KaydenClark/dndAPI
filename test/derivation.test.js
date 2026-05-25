// Standalone unit tests for the character derivation engine.
// These exercise buildCharacterDocument() as a pure function with hand-built
// compendium Maps - no MongoDB, no network - so they run anywhere with `node`.
// They cover the Phase 1 background-grant wiring and guard core combat math.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCharacterDocument } = require('../services/characterDerivation');

// Minimal compendium (Maps keyed by id): Human + Fighter + Longsword + the
// Soldier background. Enough to derive a level 1 melee build.
function makeCompendium() {
    return {
        races: new Map([
            ['human', {
                id: 'human',
                name: 'Human',
                abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
                weaponProficiencies: [],
                featureIds: [],
                speed: 30,
                languages: ['Common']
            }]
        ]),
        classes: new Map([
            ['fighter', {
                id: 'fighter',
                name: 'Fighter',
                hitDie: 10,
                savingThrowProficiencies: ['str', 'con'],
                armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
                weaponProficiencies: ['simple', 'martial'],
                skillChoiceRules: { choose: 2, options: ['athletics', 'perception'] },
                spellcasting: null,
                levelProgression: { 1: { featureIds: ['second-wind'] } }
            }]
        ]),
        subclasses: new Map(),
        weapons: new Map([
            ['longsword', {
                id: 'longsword',
                name: 'Longsword',
                category: 'martial',
                weaponType: 'melee',
                damageDice: '1d8',
                damageType: 'slashing',
                finesse: false,
                range: null,
                properties: []
            }]
        ]),
        armor: new Map(),
        features: new Map([
            ['second-wind', { id: 'second-wind', name: 'Second Wind', description: 'Regain hit points.' }]
        ]),
        spells: new Map(),
        backgrounds: new Map([
            ['soldier', {
                id: 'soldier',
                name: 'Soldier',
                skillProficiencies: ['athletics', 'intimidation'],
                languages: ['Orc'],
                toolProficiencies: ['gaming-set']
            }]
        ])
    };
}

// Base level 1 Fighter used across tests. str 15 (+1 racial = 16, mod +3).
function baseCharacter(overrides = {}) {
    return {
        characterName: 'Test Fighter',
        raceId: 'human',
        classId: 'fighter',
        level: 1,
        baseAbilityScores: { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 },
        equippedWeaponIds: ['longsword'],
        ...overrides
    };
}

test('derives a proficient weapon attack from ability scores', () => {
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    const attack = result.attacks[0];

    // str 15 + 1 racial = 16 -> mod +3; proficiency bonus 2; proficient with martial.
    assert.equal(attack.name, 'Longsword');
    assert.equal(attack.proficient, true);
    assert.equal(attack.attackBonus, 5);
    assert.equal(attack.damageSummary, '1d8 + 3 slashing');
});

test('background grants skills without baking them into raw skillProficiencies', () => {
    const character = baseCharacter({
        background: 'soldier',
        skillProficiencies: ['perception'] // the player's class pick
    });
    const result = buildCharacterDocument(character, makeCompendium());

    // Raw skillProficiencies keeps only the character's own picks.
    assert.deepEqual(result.skillProficiencies, ['perception']);
    // Background skills are surfaced on their own field.
    assert.deepEqual([...result.backgroundSkillProficiencies].sort(), ['athletics', 'intimidation']);
    // Derived skill values reflect BOTH class picks and background grants.
    // athletics: str mod +3 + prof 2 = 5 (granted by background)
    assert.equal(result.skillValues.athletics, 5);
    // perception: wis 13 + 1 racial = 14 -> mod +2; + prof 2 = 4 (class pick)
    assert.equal(result.skillValues.perception, 4);
    // arcana: int 11 -> mod 0; not proficient = 0
    assert.equal(result.skillValues.arcana, 0);
    // Resolved background name is exposed for display.
    assert.equal(result.backgroundName, 'Soldier');
    // Background languages and tool proficiencies are folded in.
    assert.ok(result.languages.includes('Orc'));
    assert.ok(result.toolProficiencies.includes('gaming-set'));
});

test('a free-text background contributes no grants and does not throw', () => {
    const character = baseCharacter({ background: 'A Homebrew Past' });
    const result = buildCharacterDocument(character, makeCompendium());

    assert.deepEqual(result.backgroundSkillProficiencies, []);
    assert.equal(result.backgroundName, 'A Homebrew Past');
});

test('derivation does not throw when the backgrounds compendium is absent', () => {
    const compendium = makeCompendium();
    delete compendium.backgrounds;

    const result = buildCharacterDocument(baseCharacter({ background: 'soldier' }), compendium);

    // Guard holds: no background data, no grants, no crash.
    assert.deepEqual(result.backgroundSkillProficiencies, []);
    assert.ok(Array.isArray(result.languages));
});
