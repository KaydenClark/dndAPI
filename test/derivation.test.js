// Standalone unit tests for the character derivation engine.
// These exercise buildCharacterDocument() as a pure function with hand-built
// compendium Maps - no MongoDB, no network - so they run anywhere with `node`.
// They cover the Phase 1 background-grant wiring and guard core combat math.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCharacterDocument, getProficiencyBonus } = require('../services/characterDerivation');

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

test('expertise doubles proficiency for a proficient skill', () => {
    const character = baseCharacter({
        background: 'soldier',
        skillProficiencies: ['perception'],
        expertiseProficiencies: ['perception']
    });
    const result = buildCharacterDocument(character, makeCompendium());

    assert.deepEqual(result.expertiseProficiencies, ['perception']);
    // perception: wis 13 + 1 racial = 14 -> mod +2; double prof 2 + 2 = +6.
    assert.equal(result.skillValues.perception, 6);
    assert.equal(result.passivePerception, 16);
});

test('expertise ignores skills that are not already proficient', () => {
    const character = baseCharacter({
        skillProficiencies: ['perception'],
        expertiseProficiencies: ['arcana']
    });
    const result = buildCharacterDocument(character, makeCompendium());

    assert.deepEqual(result.expertiseProficiencies, []);
    assert.equal(result.skillValues.arcana, 0);
});

// ─── Extended compendium fixtures ────────────────────────────────────────────

// Extends the base Fighter/Human/Longsword compendium with a Wizard class,
// canonical spells, armor pieces, a Hill Dwarf race, a Champion subclass, and
// extra weapons to drive proficiency filtering tests.
function makeExtendedCompendium() {
    const compendium = makeCompendium();

    compendium.classes.set('wizard', {
        id: 'wizard',
        name: 'Wizard',
        hitDie: 6,
        savingThrowProficiencies: ['int', 'wis'],
        armorProficiencies: [],
        weaponProficiencies: ['simple'],
        skillChoiceRules: { choose: 2, options: ['arcana', 'history'] },
        spellcasting: {
            ability: 'int',
            kind: 'prepared',
            spellSlotsByLevel: {
                1: { level_1: 2 },
                3: { level_1: 4, level_2: 2 },
                5: { level_1: 4, level_2: 3, level_3: 2 }
            }
        },
        levelProgression: {}
    });

    compendium.spells.set('fire-bolt', {
        id: 'fire-bolt',
        name: 'Fire Bolt',
        level: 0,
        classes: ['wizard'],
        damage: { base: '1d10', type: 'fire' },
        scaling: { 1: '1d10', 5: '2d10', 11: '3d10', 17: '4d10' },
        school: 'evocation',
        range: '120 feet',
        components: ['V', 'S']
    });

    compendium.spells.set('magic-missile', {
        id: 'magic-missile',
        name: 'Magic Missile',
        level: 1,
        classes: ['wizard'],
        damage: { base: '3d4+3', type: 'force' },
        scaling: { 2: '+1d4+1', 3: '+2d4+2' },
        school: 'evocation',
        range: '120 feet',
        components: ['V', 'S']
    });

    compendium.spells.set('fireball', {
        id: 'fireball',
        name: 'Fireball',
        level: 3,
        classes: ['wizard'],
        damage: { base: '8d6', type: 'fire' },
        scaling: { 4: '9d6' },
        school: 'evocation',
        range: '150 feet',
        components: ['V', 'S', 'M']
    });

    compendium.races.set('hill-dwarf', {
        id: 'hill-dwarf',
        name: 'Hill Dwarf',
        abilityBonuses: { con: 2, wis: 1 },
        weaponProficiencies: [],
        featureIds: ['dwarven-toughness'],
        speed: 25,
        languages: ['Common', 'Dwarvish']
    });

    compendium.armor.set('leather', {
        id: 'leather',
        name: 'Leather',
        category: 'light',
        baseAc: 11
        // dexCap absent → full dex bonus applied
    });

    compendium.armor.set('chain-mail', {
        id: 'chain-mail',
        name: 'Chain Mail',
        category: 'heavy',
        baseAc: 16,
        dexCap: 0
    });

    compendium.armor.set('shield', {
        id: 'shield',
        name: 'Shield',
        category: 'shield',
        baseAc: 2
    });

    compendium.subclasses.set('champion', {
        id: 'champion',
        name: 'Champion',
        levelFeatures: {
            3: { featureIds: ['improved-critical'] }
        }
    });

    // Dagger: simple, proficient for fighter; used in proficiency filter tests
    compendium.weapons.set('dagger', {
        id: 'dagger',
        name: 'Dagger',
        category: 'simple',
        weaponType: 'melee',
        damageDice: '1d4',
        damageType: 'piercing',
        finesse: true,
        range: { normal: 20, long: 60 },
        properties: ['finesse', 'thrown']
    });

    // Greataxe: exotic category → fighter is NOT proficient
    compendium.weapons.set('greataxe', {
        id: 'greataxe',
        name: 'Greataxe',
        category: 'exotic',
        weaponType: 'melee',
        damageDice: '1d12',
        damageType: 'slashing',
        finesse: false,
        range: null,
        properties: ['heavy', 'two-handed']
    });

    return compendium;
}

// Wizard character used across spellcasting tests.
// human +1 all: int 16+1=17 (mod +3); prof 2 at level 1.
function wizardCharacter(overrides = {}) {
    return {
        characterName: 'Merlin',
        raceId: 'human',
        classId: 'wizard',
        level: 1,
        baseAbilityScores: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 8 },
        ...overrides
    };
}

// ─── Saving throws ───────────────────────────────────────────────────────────

test('saving throws add proficiency bonus only to proficient abilities', () => {
    // Fighter: proficient in str and con.
    // After human +1: str 16(+3), dex 13(+1), con 15(+2), int 11(+0), wis 14(+2), cha 9(-1)
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());

    assert.equal(result.savingThrows.str, 5);   // +3 + prof 2
    assert.equal(result.savingThrows.con, 4);   // +2 + prof 2
    assert.equal(result.savingThrows.dex, 1);   // +1, not proficient
    assert.equal(result.savingThrows.int, 0);   // +0, not proficient
    assert.equal(result.savingThrows.wis, 2);   // +2, not proficient
    assert.equal(result.savingThrows.cha, -1);  // -1, not proficient
});

// ─── Passive perception & initiative ─────────────────────────────────────────

test('passive perception is 10 + wis modifier when not proficient in perception', () => {
    // wis 13 + 1 human = 14 → mod +2; passive = 10 + 2 = 12
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(result.passivePerception, 12);
});

test('passive perception includes proficiency bonus when proficient in perception', () => {
    // wis mod +2 + prof 2 = 4; passive = 10 + 4 = 14
    const result = buildCharacterDocument(
        baseCharacter({ skillProficiencies: ['perception'] }),
        makeCompendium()
    );
    assert.equal(result.passivePerception, 14);
});

test('initiative equals the dexterity modifier', () => {
    // dex 12 + 1 human = 13 → mod +1
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(result.initiative, 1);
});

// ─── Spellcasting ────────────────────────────────────────────────────────────

test('non-spellcasting class has null spellSaveDC and null spellAttackBonus', () => {
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(result.spellSaveDC, null);
    assert.equal(result.spellAttackBonus, null);
});

test('wizard derives correct spellSaveDC and spellAttackBonus from intelligence', () => {
    // int 16 + 1 human = 17 → mod +3; prof 2 at level 1
    // spellSaveDC: 8 + 2 + 3 = 13; spellAttackBonus: 2 + 3 = 5
    const result = buildCharacterDocument(wizardCharacter(), makeExtendedCompendium());
    assert.equal(result.spellSaveDC, 13);
    assert.equal(result.spellAttackBonus, 5);
});

test('cantrip damage scales to the highest tier at or below the character level', () => {
    // fire-bolt scaling: { 1:'1d10', 5:'2d10', 11:'3d10', 17:'4d10' }
    const level5 = buildCharacterDocument(
        wizardCharacter({ level: 5, cantripIds: ['fire-bolt'] }),
        makeExtendedCompendium()
    );
    const level11 = buildCharacterDocument(
        wizardCharacter({ level: 11, cantripIds: ['fire-bolt'] }),
        makeExtendedCompendium()
    );

    assert.equal(level5.resolvedSpells.cantrips[0].damageSummary, '2d10 fire');
    assert.equal(level11.resolvedSpells.cantrips[0].damageSummary, '3d10 fire');
});

test('cantrip uses the level-1 scaling tier at character level 1', () => {
    const result = buildCharacterDocument(
        wizardCharacter({ cantripIds: ['fire-bolt'] }),
        makeExtendedCompendium()
    );
    assert.equal(result.resolvedSpells.cantrips[0].damageSummary, '1d10 fire');
});

test('leveled spell with upcasting adds slot-level scaling to the damage summary', () => {
    // magic-missile: base '3d4+3 force', scaling { 2: '+1d4+1', 3: '+2d4+2' }
    const result = buildCharacterDocument(
        wizardCharacter({ level: 3, knownSpellIds: ['magic-missile'] }),
        makeExtendedCompendium()
    );
    const spell = result.resolvedSpells.known[0];

    assert.ok(
        spell.damageSummary.startsWith('3d4+3 force'),
        `expected base damage first, got: ${spell.damageSummary}`
    );
    assert.ok(
        spell.damageSummary.includes('L2: +1d4+1'),
        `expected slot scaling annotation, got: ${spell.damageSummary}`
    );
});

test('availableSpellIds filters spells by class membership and maximum slot level', () => {
    // Level 3 wizard: slots { level_1: 4, level_2: 2 } → maxSpellLevel 2
    // fire-bolt (L0) + magic-missile (L1) qualify; fireball (L3) does not
    const result = buildCharacterDocument(
        wizardCharacter({ level: 3 }),
        makeExtendedCompendium()
    );

    assert.ok(result.availableSpellIds.includes('fire-bolt'), 'cantrips should always be available');
    assert.ok(result.availableSpellIds.includes('magic-missile'), 'L1 spell within slot range should be available');
    assert.ok(!result.availableSpellIds.includes('fireball'), 'L3 spell exceeds max slot level');
});

// ─── Subclass features ───────────────────────────────────────────────────────

test('subclass levelFeatures are collected into featureIds at the correct level', () => {
    // Champion grants improved-critical at level 3
    const result = buildCharacterDocument(
        baseCharacter({ level: 3, subclassId: 'champion' }),
        makeExtendedCompendium()
    );
    assert.ok(result.featureIds.includes('improved-critical'));
});

test('subclass features beyond the character level are not collected', () => {
    // Character is level 2; improved-critical requires level 3
    const result = buildCharacterDocument(
        baseCharacter({ level: 2, subclassId: 'champion' }),
        makeExtendedCompendium()
    );
    assert.ok(!result.featureIds.includes('improved-critical'));
});

// ─── Dwarven Toughness ───────────────────────────────────────────────────────

test('hill dwarf dwarven toughness adds the character level to max HP', () => {
    // Hill Dwarf: con +2. Base con 14 → 16 (mod +3).
    // Fighter L3: firstLevel = 10+3=13; perLevel = max(1,5+1+3)=9
    // Base HP: 13 + 2*9 = 31; with Dwarven Toughness: 31 + 3 = 34
    const result = buildCharacterDocument({
        characterName: 'Thorin',
        raceId: 'hill-dwarf',
        classId: 'fighter',
        level: 3,
        baseAbilityScores: { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 }
    }, makeExtendedCompendium());

    assert.equal(result.maxHp, 34);
    assert.ok(result.featureIds.includes('dwarven-toughness'));
});

// ─── Armor class ─────────────────────────────────────────────────────────────

test('unarmored AC is 10 plus dexterity modifier', () => {
    // dex 12 + 1 human = 13 → mod +1; unarmored → AC 11
    const result = buildCharacterDocument(baseCharacter({ armorId: null }), makeCompendium());
    assert.equal(result.armorClass, 11);
});

test('light armor AC adds the full dexterity modifier', () => {
    // leather: baseAc 11, dexCap absent → 11 + dexMod(+1) = 12
    const result = buildCharacterDocument(
        baseCharacter({ armorId: 'leather' }),
        makeExtendedCompendium()
    );
    assert.equal(result.armorClass, 12);
});

test('heavy armor AC clamps dexterity bonus to zero when dexCap is 0', () => {
    // chain-mail: baseAc 16, dexCap 0 → 16 + min(+1, 0) = 16
    const result = buildCharacterDocument(
        baseCharacter({ armorId: 'chain-mail' }),
        makeExtendedCompendium()
    );
    assert.equal(result.armorClass, 16);
});

test('a shield adds its baseAc to the armor class', () => {
    // chain-mail(16) + shield(+2) = 18
    const result = buildCharacterDocument(
        baseCharacter({ armorId: 'chain-mail', shieldId: 'shield' }),
        makeExtendedCompendium()
    );
    assert.equal(result.armorClass, 18);
});

// ─── Available weapon filtering ───────────────────────────────────────────────

test('availableWeaponIds contains only weapons the character is proficient with', () => {
    // Fighter: simple + martial proficiency
    // Compendium: longsword (martial ✓), dagger (simple ✓), greataxe (exotic ✗)
    const result = buildCharacterDocument(baseCharacter(), makeExtendedCompendium());

    assert.ok(result.availableWeaponIds.includes('longsword'), 'martial weapon should be available');
    assert.ok(result.availableWeaponIds.includes('dagger'), 'simple weapon should be available');
    assert.ok(!result.availableWeaponIds.includes('greataxe'), 'exotic weapon should not be available');
});

// ─── Currency, conditions, and other tracked fields ──────────────────────────

test('currency values default to 0 and preserve explicitly set amounts', () => {
    const withCurrency = buildCharacterDocument(
        baseCharacter({ currency: { gp: 150, sp: 7 } }),
        makeCompendium()
    );
    assert.equal(withCurrency.currency.gp, 150);
    assert.equal(withCurrency.currency.sp, 7);
    assert.equal(withCurrency.currency.cp, 0);
    assert.equal(withCurrency.currency.pp, 0);

    const withoutCurrency = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.deepEqual(withoutCurrency.currency, { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
});

test('conditions array is preserved unchanged on the derived document', () => {
    const result = buildCharacterDocument(
        baseCharacter({ conditions: ['poisoned', 'blinded'] }),
        makeCompendium()
    );
    assert.deepEqual(result.conditions, ['poisoned', 'blinded']);
});

test('non-array conditions are normalised to an empty array', () => {
    const result = buildCharacterDocument(
        baseCharacter({ conditions: 'poisoned' }),
        makeCompendium()
    );
    assert.deepEqual(result.conditions, []);
});

// ─── Level clamping and derived defaults ─────────────────────────────────────

test('character level is clamped to the valid 1-20 range', () => {
    const tooLow = buildCharacterDocument(baseCharacter({ level: 0 }), makeCompendium());
    const tooHigh = buildCharacterDocument(baseCharacter({ level: 25 }), makeCompendium());

    assert.equal(tooLow.level, 1);
    assert.equal(tooHigh.level, 20);
});

test('currentHp defaults to maxHp when not explicitly provided', () => {
    // Level 1 fighter: firstLevel = hitDie(10) + con mod(+2) = 12
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());

    assert.equal(result.maxHp, 12);
    assert.equal(result.currentHp, result.maxHp);
});

test('hitDiceRemaining defaults to the character level when not set', () => {
    const result = buildCharacterDocument(baseCharacter({ level: 3 }), makeCompendium());
    assert.equal(result.hitDiceRemaining, 3);
});

// ─── resolveByIdOrName name fallback ─────────────────────────────────────────

test('race is resolved by name when raceId does not match any compendium key', () => {
    // raceId is unset; raceName 'Human' slugifies to 'human' which matches
    // the compendium entry with name 'Human'. Racial bonuses should be applied.
    const result = buildCharacterDocument({
        ...baseCharacter(),
        raceId: undefined,
        raceName: 'Human'
    }, makeCompendium());

    // Human +1 str: 15+1=16 (+3 mod) — confirms race was resolved
    assert.equal(result.abilityScores.str, 16);
    assert.equal(result.raceName, 'Human');
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

test('numeric background language choices do not crash language derivation', () => {
    const compendium = makeCompendium();
    compendium.backgrounds.set('sage', {
        id: 'sage',
        name: 'Sage',
        skillProficiencies: ['arcana', 'history'],
        languages: 2,
        toolProficiencies: []
    });

    const result = buildCharacterDocument(baseCharacter({ background: 'sage' }), compendium);

    assert.equal(result.backgroundName, 'Sage');
    assert.deepEqual(result.languages, ['Common']);
});

test('finesse weapons use dexterity when it is better than strength', () => {
    const compendium = makeCompendium();
    compendium.weapons.set('dagger', {
        id: 'dagger',
        name: 'Dagger',
        category: 'simple',
        weaponType: 'melee',
        damageDice: '1d4',
        damageType: 'piercing',
        finesse: true,
        range: { normal: 20, long: 60 },
        properties: ['finesse', 'thrown']
    });

    const result = buildCharacterDocument(baseCharacter({
        baseAbilityScores: { str: 8, dex: 17, con: 14, int: 10, wis: 13, cha: 8 },
        equippedWeaponIds: ['dagger']
    }), compendium);

    assert.equal(result.attacks[0].attackAbility, 'dex');
    assert.equal(result.attacks[0].attackBonus, 6);
    assert.equal(result.attacks[0].damageSummary, '1d4 + 4 piercing');
});

test('ranged weapons use dexterity and skip proficiency bonus when not proficient', () => {
    const compendium = makeCompendium();
    compendium.classes.get('fighter').weaponProficiencies = ['simple'];
    compendium.weapons.set('hand-crossbow', {
        id: 'hand-crossbow',
        name: 'Hand Crossbow',
        category: 'martial',
        weaponType: 'ranged',
        damageDice: '1d6',
        damageType: 'piercing',
        finesse: false,
        range: { normal: 30, long: 120 },
        properties: ['ammunition', 'light', 'loading']
    });

    const result = buildCharacterDocument(baseCharacter({
        equippedWeaponIds: ['hand-crossbow'],
        weaponProficiencies: []
    }), compendium);

    assert.equal(result.attacks[0].attackAbility, 'dex');
    assert.equal(result.attacks[0].proficient, false);
    assert.equal(result.attacks[0].attackBonus, 1);
});

test('spell slot expended counts are capped at derived slot totals', () => {
    const compendium = makeCompendium();
    compendium.classes.set('wizard', {
        id: 'wizard',
        name: 'Wizard',
        hitDie: 6,
        savingThrowProficiencies: ['int', 'wis'],
        armorProficiencies: [],
        weaponProficiencies: ['simple'],
        skillChoiceRules: { choose: 2, options: ['arcana', 'history'] },
        spellcasting: {
            ability: 'int',
            kind: 'prepared',
            spellSlotsByLevel: {
                3: { level_1: 4, level_2: 2 }
            }
        },
        levelProgression: {}
    });

    const result = buildCharacterDocument(baseCharacter({
        classId: 'wizard',
        level: 3,
        baseAbilityScores: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
        spellSlots: {
            level_1: { slotsExpended: 9 },
            level_2: { slotsExpended: 1 }
        }
    }), compendium);

    assert.equal(result.spellSlots.level_1.slotTotal, 4);
    assert.equal(result.spellSlots.level_1.slotsExpended, 4);
    assert.equal(result.spellSlots.level_2.slotsExpended, 1);
});

test('explicit maxHp/currentHp/hitDiceRemaining override derived defaults', () => {
    const result = buildCharacterDocument(baseCharacter({
        maxHp: 99,
        currentHp: 12,
        hitDiceRemaining: 0
    }), makeCompendium());

    assert.equal(result.maxHp, 99);
    assert.equal(result.currentHp, 12);
    assert.equal(result.hitDiceRemaining, 0);
});

test('unknown equipment ids are ignored instead of creating broken attacks', () => {
    const result = buildCharacterDocument(baseCharacter({
        equippedWeaponIds: ['missing-weapon', 'longsword']
    }), makeCompendium());

    assert.equal(result.attacks.length, 1);
    assert.equal(result.attacks[0].weaponId, 'longsword');
});

// ─── Rest recovery ────────────────────────────────────────────────────────────

test('non-caster fighter has spellcasting.restRecovery of long', () => {
    // Fighter has no spellcasting; restRecovery should default to 'long'.
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(result.spellcasting.restRecovery, 'long');
});

test('wizard (long-rest caster) has spellcasting.restRecovery of long', () => {
    const result = buildCharacterDocument(wizardCharacter(), makeExtendedCompendium());
    assert.equal(result.spellcasting.restRecovery, 'long');
});

test('warlock (short-rest caster) has spellcasting.restRecovery of short', () => {
    const compendium = makeExtendedCompendium();
    compendium.classes.set('warlock', {
        id: 'warlock',
        name: 'Warlock',
        hitDie: 8,
        savingThrowProficiencies: ['wis', 'cha'],
        armorProficiencies: ['light'],
        weaponProficiencies: ['simple'],
        skillChoiceRules: { choose: 2, options: ['arcana', 'deception'] },
        spellcasting: {
            ability: 'cha',
            kind: 'known',
            restRecovery: 'short',
            spellSlotsByLevel: {
                1: { level_1: 1 },
                2: { level_1: 2 },
                3: { level_2: 2 },
                5: { level_3: 2 }
            }
        },
        levelProgression: {}
    });

    const result = buildCharacterDocument({
        characterName: 'Shadow',
        raceId: 'human',
        classId: 'warlock',
        level: 5,
        baseAbilityScores: { str: 8, dex: 12, con: 12, int: 10, wis: 10, cha: 16 }
    }, compendium);

    assert.equal(result.spellcasting.restRecovery, 'short');
    assert.equal(result.spellSlots.level_3.slotTotal, 2);
});

// ─── Half-caster spell slots ──────────────────────────────────────────────────

test('paladin half-caster has no spell slots at level 1', () => {
    const compendium = makeCompendium();
    compendium.classes.set('paladin', {
        id: 'paladin',
        name: 'Paladin',
        hitDie: 10,
        savingThrowProficiencies: ['wis', 'cha'],
        armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
        weaponProficiencies: ['simple', 'martial'],
        skillChoiceRules: { choose: 2, options: ['athletics', 'persuasion'] },
        spellcasting: {
            ability: 'cha',
            kind: 'prepared',
            spellSlotsByLevel: {
                2: { level_1: 2 },
                3: { level_1: 3 },
                5: { level_1: 4, level_2: 2 }
            }
        },
        levelProgression: {}
    });

    const level1 = buildCharacterDocument({
        characterName: 'Arthas',
        raceId: 'human',
        classId: 'paladin',
        level: 1,
        baseAbilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }
    }, compendium);

    const level2 = buildCharacterDocument({
        characterName: 'Arthas',
        raceId: 'human',
        classId: 'paladin',
        level: 2,
        baseAbilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }
    }, compendium);

    assert.equal(level1.spellSlots.level_1.slotTotal, 0);
    assert.equal(level2.spellSlots.level_1.slotTotal, 2);
});

// ─── Death saves ─────────────────────────────────────────────────────────────

test('deathSaves defaults to zeroes when not provided', () => {
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.deepEqual(result.deathSaves, { successes: 0, failures: 0 });
});

test('deathSaves preserves an existing tracked state', () => {
    const result = buildCharacterDocument(
        baseCharacter({ deathSaves: { successes: 2, failures: 1 } }),
        makeCompendium()
    );
    assert.deepEqual(result.deathSaves, { successes: 2, failures: 1 });
});

// ─── Flavor text fields ───────────────────────────────────────────────────────

test('flavor text fields are preserved on the derived document', () => {
    const result = buildCharacterDocument(baseCharacter({
        traits: 'Brave',
        ideals: 'Justice',
        bonds: 'My hometown',
        flaws: 'Reckless',
        backstory: 'Was an orphan'
    }), makeCompendium());

    assert.equal(result.traits, 'Brave');
    assert.equal(result.ideals, 'Justice');
    assert.equal(result.bonds, 'My hometown');
    assert.equal(result.flaws, 'Reckless');
    assert.equal(result.backstory, 'Was an orphan');
});

// ─── Inventory and equipment ──────────────────────────────────────────────────

test('inventory and equipment arrays are preserved on the derived document', () => {
    const result = buildCharacterDocument(
        baseCharacter({ inventory: ['Rope', 'Torch'], equipment: ['Backpack'] }),
        makeCompendium()
    );
    assert.deepEqual(result.inventory, ['Rope', 'Torch']);
    assert.deepEqual(result.equipment, ['Backpack']);
});

test('non-array inventory and equipment are normalised to empty arrays', () => {
    const result = buildCharacterDocument(
        baseCharacter({ inventory: 'Rope', equipment: null }),
        makeCompendium()
    );
    assert.deepEqual(result.inventory, []);
    assert.deepEqual(result.equipment, []);
});

// ─── Numeric defaults ─────────────────────────────────────────────────────────

test('tempHp defaults to 0 and xp defaults to 0', () => {
    const result = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(result.tempHp, 0);
    assert.equal(result.xp, 0);
});

// ─── Alignment ───────────────────────────────────────────────────────────────

test('alignment is preserved when set and defaults to empty string when absent', () => {
    const withAlignment = buildCharacterDocument(
        baseCharacter({ alignment: 'Chaotic Good' }),
        makeCompendium()
    );
    assert.equal(withAlignment.alignment, 'Chaotic Good');

    const withoutAlignment = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(withoutAlignment.alignment, '');
});

// ─── Speed from race ─────────────────────────────────────────────────────────

test('speed comes from the race entry (human 30, hill-dwarf 25)', () => {
    const humanResult = buildCharacterDocument(baseCharacter(), makeExtendedCompendium());
    assert.equal(humanResult.speed, 30);

    const dwarfResult = buildCharacterDocument({
        characterName: 'Gimli',
        raceId: 'hill-dwarf',
        classId: 'fighter',
        level: 1,
        baseAbilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 8 }
    }, makeExtendedCompendium());
    assert.equal(dwarfResult.speed, 25);
});

// ─── hitDie format string ─────────────────────────────────────────────────────

test('hitDie is formatted as a die string from the class entry', () => {
    const fighter = buildCharacterDocument(baseCharacter(), makeCompendium());
    assert.equal(fighter.hitDie, 'd10');

    const wizard = buildCharacterDocument(wizardCharacter(), makeExtendedCompendium());
    assert.equal(wizard.hitDie, 'd6');

    const noClass = buildCharacterDocument(
        { characterName: 'Nobody', level: 1, baseAbilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
        makeCompendium()
    );
    assert.equal(noClass.hitDie, '');
});

// ─── getProficiencyBonus at multiple levels ───────────────────────────────────

test('getProficiencyBonus returns the correct value across all tier boundaries', () => {
    // Tier 1: levels 1-4 → +2
    assert.equal(getProficiencyBonus(1), 2);
    assert.equal(getProficiencyBonus(4), 2);
    // Tier 2: levels 5-8 → +3
    assert.equal(getProficiencyBonus(5), 3);
    assert.equal(getProficiencyBonus(8), 3);
    // Tier 3: levels 9-12 → +4
    assert.equal(getProficiencyBonus(9), 4);
    assert.equal(getProficiencyBonus(12), 4);
    // Tier 4: levels 13-16 → +5
    assert.equal(getProficiencyBonus(13), 5);
    assert.equal(getProficiencyBonus(16), 5);
    // Tier 5: levels 17-20 → +6
    assert.equal(getProficiencyBonus(17), 6);
    assert.equal(getProficiencyBonus(20), 6);
});

// ─── Expertise on passive perception ─────────────────────────────────────────

test('expertise in perception adds a second proficiency bonus to passivePerception', () => {
    // wis 13 + 1 human = 14 → mod +2; prof 2 at level 1
    // With both proficiency and expertise: passive = 10 + 2 + 2 + 2 = 16
    const result = buildCharacterDocument(baseCharacter({
        skillProficiencies: ['perception'],
        expertiseProficiencies: ['perception']
    }), makeCompendium());

    // Basic proficiency alone would give 14; expertise adds another profBonus.
    assert.equal(result.passivePerception, 16);
    // Confirm the skill value also reflects double proficiency.
    assert.equal(result.skillValues.perception, 6);
});

// ─── subclassId and subclassName ──────────────────────────────────────────────

test('subclassId and subclassName are resolved from the compendium', () => {
    const result = buildCharacterDocument(
        baseCharacter({ level: 3, subclassId: 'champion' }),
        makeExtendedCompendium()
    );
    assert.equal(result.subclassId, 'champion');
    assert.equal(result.subclassName, 'Champion');
});

// ─── toolProficiencies merge ──────────────────────────────────────────────────

test('toolProficiencies merges character picks and background grants', () => {
    // Soldier background grants 'gaming-set'; character adds 'thieves-tools'.
    const result = buildCharacterDocument(baseCharacter({
        background: 'soldier',
        toolProficiencies: ['thieves-tools']
    }), makeCompendium());

    assert.ok(result.toolProficiencies.includes('thieves-tools'), 'character tool should be present');
    assert.ok(result.toolProficiencies.includes('gaming-set'), 'background tool should be present');
});
