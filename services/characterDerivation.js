const SKILL_ABILITIES = {
    acrobatics: 'dex',
    animalHandling: 'wis',
    arcana: 'int',
    athletics: 'str',
    deception: 'cha',
    history: 'int',
    insight: 'wis',
    intimidation: 'cha',
    investigation: 'int',
    medicine: 'wis',
    nature: 'int',
    perception: 'wis',
    performance: 'cha',
    persuasion: 'cha',
    religion: 'int',
    sleightOfHand: 'dex',
    stealth: 'dex',
    survival: 'wis'
};

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampLevel(value) {
    return Math.min(Math.max(toNumber(value, 1), 1), 20);
}

function getAbilityModifier(score) {
    return Math.floor((score - 10) / 2);
}

function getProficiencyBonus(level) {
    return 2 + Math.floor((level - 1) / 4);
}

function createEmptyAbilityScores(defaultScore = 8) {
    return {
        str: defaultScore,
        dex: defaultScore,
        con: defaultScore,
        int: defaultScore,
        wis: defaultScore,
        cha: defaultScore
    };
}

function normalizeAbilityScores(input) {
    const normalized = createEmptyAbilityScores();
    const source = input && typeof input === 'object' ? input : {};

    for (const key of ABILITY_KEYS) {
        normalized[key] = toNumber(source[key], normalized[key]);
    }

    return normalized;
}

function addAbilityBonuses(baseScores, bonuses = {}) {
    const nextScores = { ...baseScores };

    for (const key of ABILITY_KEYS) {
        nextScores[key] = nextScores[key] + toNumber(bonuses[key], 0);
    }

    return nextScores;
}

function mapAbilityModifiers(abilityScores) {
    return {
        str: getAbilityModifier(abilityScores.str),
        dex: getAbilityModifier(abilityScores.dex),
        con: getAbilityModifier(abilityScores.con),
        int: getAbilityModifier(abilityScores.int),
        wis: getAbilityModifier(abilityScores.wis),
        cha: getAbilityModifier(abilityScores.cha)
    };
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function buildSpellSlotState() {
    const slots = { cantrips: [] };

    for (let level = 1; level <= 9; level += 1) {
        slots[`level_${level}`] = {
            slotTotal: 0,
            slotsExpended: 0,
            knownSpells: []
        };
    }

    return slots;
}

function getMaxSpellLevel(slotState) {
    let highest = 0;

    for (let level = 1; level <= 9; level += 1) {
        if (slotState[`level_${level}`].slotTotal > 0) {
            highest = level;
        }
    }

    return highest;
}

function resolveByIdOrName(index, idValue, nameValue) {
    if (idValue && index.has(idValue)) {
        return index.get(idValue);
    }

    if (!nameValue) {
        return null;
    }

    const normalizedName = slugify(nameValue);

    for (const value of index.values()) {
        if (slugify(value.name) === normalizedName) {
            return value;
        }
    }

    return null;
}

function collectFeatureIds(levelProgression, level) {
    if (!levelProgression) {
        return [];
    }

    return Object.entries(levelProgression)
        .filter(([requiredLevel]) => Number(requiredLevel) <= level)
        .flatMap(([, entry]) => {
            if (Array.isArray(entry)) {
                return entry;
            }

            return entry.featureIds || [];
        });
}

function resolveWeaponProficiencySet({ race, classDoc, character }) {
    return unique([
        ...(race?.weaponProficiencies || []),
        ...(classDoc?.weaponProficiencies || []),
        ...(character.weaponProficiencies || [])
    ]);
}

function resolveArmorProficiencySet({ classDoc, character }) {
    return unique([
        ...(classDoc?.armorProficiencies || []),
        ...(character.armorProficiencies || [])
    ]);
}

function hasWeaponProficiency(weapon, proficiencySet) {
    return proficiencySet.includes(weapon.id) || proficiencySet.includes(weapon.category);
}

function hasArmorProficiency(armor, proficiencySet) {
    return proficiencySet.includes(armor.id) || proficiencySet.includes(armor.category);
}

function resolveLanguages(race, background, character) {
    const racialLanguages = Array.isArray(race?.languages)
        ? race.languages.filter((language) => language !== 'Choice')
        : [];
    const backgroundLanguages = Array.isArray(background?.languages)
        ? background.languages.filter((language) => language !== 'Choice')
        : [];
    return unique([...racialLanguages, ...backgroundLanguages, ...(character.languages || [])]);
}

function resolveHitPoints({ character, classDoc, race, abilityMods, level, featureIds }) {
    if (Number.isFinite(Number(character.maxHp))) {
        return Number(character.maxHp);
    }

    if (!classDoc) {
        return 1;
    }

    const firstLevel = classDoc.hitDie + abilityMods.con;
    const perLevelAverage = Math.max(1, Math.floor(classDoc.hitDie / 2) + 1 + abilityMods.con);
    let total = firstLevel + Math.max(0, level - 1) * perLevelAverage;

    if ((race?.featureIds || []).includes('dwarven-toughness') || featureIds.includes('dwarven-toughness')) {
        total += level;
    }

    return total;
}

function resolveArmorClass({ armor, shield, abilityMods }) {
    let armorClass = 10 + abilityMods.dex;

    if (armor && armor.category !== 'shield') {
        if (armor.dexCap === null || armor.dexCap === undefined) {
            armorClass = armor.baseAc + abilityMods.dex;
        } else {
            armorClass = armor.baseAc + Math.min(abilityMods.dex, armor.dexCap);
        }
    }

    if (shield) {
        armorClass += shield.baseAc;
    }

    return armorClass;
}

function resolveSkillValues(abilityMods, skillProficiencies, expertiseProficiencies, proficiencyBonus) {
    const proficiencySet = new Set(skillProficiencies || []);
    const expertiseSet = new Set(expertiseProficiencies || []);
    const values = {};

    for (const [skill, ability] of Object.entries(SKILL_ABILITIES)) {
        const proficiency = proficiencySet.has(skill) ? proficiencyBonus : 0;
        const expertise = expertiseSet.has(skill) ? proficiencyBonus : 0;
        values[skill] = abilityMods[ability] + proficiency + expertise;
    }

    return values;
}

function resolveSavingThrowValues(abilityMods, savingThrowProficiencies, proficiencyBonus) {
    const proficiencySet = new Set(savingThrowProficiencies || []);
    const values = {};

    for (const ability of ABILITY_KEYS) {
        values[ability] = abilityMods[ability] + (proficiencySet.has(ability) ? proficiencyBonus : 0);
    }

    return values;
}

function resolveSpellSlotState(character, classDoc, level) {
    const state = buildSpellSlotState();
    const progression = classDoc?.spellcasting?.spellSlotsByLevel || {};
    const slotTotals = progression[String(level)] || {};
    const incoming = character.spellSlots || {};

    state.cantrips = [...(character.cantripIds || [])];

    for (let spellLevel = 1; spellLevel <= 9; spellLevel += 1) {
        const key = `level_${spellLevel}`;
        const existingState = incoming[key] || {};

        state[key] = {
            slotTotal: toNumber(slotTotals[key], 0),
            slotsExpended: Math.min(
                toNumber(existingState.slotsExpended, 0),
                toNumber(slotTotals[key], 0)
            ),
            knownSpells: Array.isArray(existingState.knownSpells) ? existingState.knownSpells : []
        };
    }

    return state;
}

function chooseAttackAbility(weapon, abilityMods) {
    if (weapon.weaponType === 'ranged') {
        return 'dex';
    }

    if (weapon.finesse) {
        return abilityMods.dex > abilityMods.str ? 'dex' : 'str';
    }

    return 'str';
}

function formatModifier(value) {
    if (value === 0) {
        return '';
    }

    return value > 0 ? ` + ${value}` : ` - ${Math.abs(value)}`;
}

function resolveAttacks({ character, weaponsMap, weaponProficiencies, abilityMods, proficiencyBonus }) {
    const attacks = [];

    for (const weaponId of character.equippedWeaponIds || []) {
        const weapon = weaponsMap.get(weaponId);

        if (!weapon) {
            continue;
        }

        const ability = chooseAttackAbility(weapon, abilityMods);
        const proficient = hasWeaponProficiency(weapon, weaponProficiencies);
        const attackBonus = abilityMods[ability] + (proficient ? proficiencyBonus : 0);
        const damageSummary = `${weapon.damageDice}${formatModifier(abilityMods[ability])} ${weapon.damageType}`;

        attacks.push({
            weaponId: weapon.id,
            name: weapon.name,
            proficient,
            attackAbility: ability,
            attackBonus,
            damageSummary,
            damageType: weapon.damageType,
            range: weapon.range,
            properties: weapon.properties
        });
    }

    return attacks;
}

function resolveHighestCantripScaling(level, scaling) {
    let damage = null;

    for (const [requiredLevel, scaledDamage] of Object.entries(scaling || {})) {
        if (level >= Number(requiredLevel)) {
            damage = scaledDamage;
        }
    }

    return damage;
}

function resolveSpellSummary(spell, { level, spellSaveDC, spellAttackBonus }) {
    let damageSummary = null;

    if (spell.damage?.base) {
        damageSummary = `${spell.damage.base} ${spell.damage.type}`;
    }

    if (spell.level === 0) {
        const scaledDamage = resolveHighestCantripScaling(level, spell.scaling);

        if (scaledDamage) {
            damageSummary = `${scaledDamage} ${spell.damage?.type || ''}`.trim();
        }
    } else if (spell.scaling && Object.keys(spell.scaling).length > 0) {
        const scalingSummary = Object.entries(spell.scaling)
            .map(([slotLevel, scaling]) => `L${slotLevel}: ${scaling}`)
            .join(', ');

        if (damageSummary) {
            damageSummary = `${damageSummary} (${scalingSummary})`;
        } else {
            damageSummary = scalingSummary;
        }
    }

    return {
        id: spell.id,
        name: spell.name,
        level: spell.level,
        school: spell.school,
        range: spell.range,
        duration: spell.duration,
        components: spell.components,
        attackType: spell.attackType,
        saveType: spell.saveType,
        damageSummary,
        spellSaveDC,
        spellAttackBonus,
        description: spell.description
    };
}

function resolveAvailableSpellIds({ classDoc, level, spellsMap }) {
    if (!classDoc?.spellcasting) {
        return [];
    }

    const spellSlots = classDoc.spellcasting.spellSlotsByLevel?.[String(level)] || {};
    const maxSpellLevel = Object.keys(spellSlots)
        .map((key) => Number(key.replace('level_', '')))
        .filter((value) => Number.isFinite(value))
        .reduce((highest, current) => Math.max(highest, current), 0);

    return [...spellsMap.values()]
        .filter((spell) => spell.classes.includes(classDoc.id) && (spell.level === 0 || spell.level <= maxSpellLevel))
        .map((spell) => spell.id);
}

function resolveResolvedSpells({ character, spellsMap, level, spellSaveDC, spellAttackBonus }) {
    const resolveList = (ids) => unique(ids)
        .map((id) => spellsMap.get(id))
        .filter(Boolean)
        .map((spell) => resolveSpellSummary(spell, { level, spellSaveDC, spellAttackBonus }));

    return {
        cantrips: resolveList(character.cantripIds || []),
        known: resolveList(character.knownSpellIds || []),
        prepared: resolveList(character.preparedSpellIds || [])
    };
}

function buildCharacterDocument(character, compendium) {
    const level = clampLevel(character.level);
    const race = resolveByIdOrName(compendium.races, character.raceId, character.race || character.raceName);
    const classDoc = resolveByIdOrName(compendium.classes, character.classId, character.class || character.className);
    const subclass = resolveByIdOrName(compendium.subclasses, character.subclassId, character.subclass || character.subclassName);
    // Backgrounds are optional and may not be seeded yet; default to an empty
    // Map so id/name resolution never throws on older or partial compendium data.
    const backgroundsMap = compendium.backgrounds || new Map();
    const background = resolveByIdOrName(backgroundsMap, character.background, character.background);

    const baseAbilityScores = normalizeAbilityScores(character.baseAbilityScores || character.abilityScores || character);
    const abilityScores = character.baseAbilityScores
        ? addAbilityBonuses(baseAbilityScores, race?.abilityBonuses)
        : baseAbilityScores;
    const abilityMods = mapAbilityModifiers(abilityScores);
    const proficiencyBonus = getProficiencyBonus(level);

    const featureIds = unique([
        ...(race?.featureIds || []),
        ...collectFeatureIds(classDoc?.levelProgression, level),
        ...collectFeatureIds(subclass?.levelFeatures, level),
        ...(character.featureIds || [])
    ]);

    const weaponProficiencies = resolveWeaponProficiencySet({ race, classDoc, character });
    const armorProficiencies = resolveArmorProficiencySet({ classDoc, character });

    const armor = compendium.armor.get(character.armorId);
    const shield = compendium.armor.get(character.shieldId);

    const savingThrowProficiencies = unique([
        ...(classDoc?.savingThrowProficiencies || []),
        ...(character.savingThrowProficiencies || [])
    ]);

    // skillProficiencies stays as the character's own (class) picks so the
    // value round-trips cleanly through save/load. Background-granted skills
    // are tracked separately and only folded in for the derived skill values.
    const skillProficiencies = unique(character.skillProficiencies || []);
    const backgroundSkillProficiencies = unique(background?.skillProficiencies || []);
    const effectiveSkillProficiencies = unique([...skillProficiencies, ...backgroundSkillProficiencies]);
    const expertiseProficiencies = unique(character.expertiseProficiencies || [])
        .filter((skill) => effectiveSkillProficiencies.includes(skill));
    const skillValues = resolveSkillValues(abilityMods, effectiveSkillProficiencies, expertiseProficiencies, proficiencyBonus);
    const savingThrows = resolveSavingThrowValues(abilityMods, savingThrowProficiencies, proficiencyBonus);

    const spellSlots = resolveSpellSlotState(character, classDoc, level);
    const spellcastingAbility = classDoc?.spellcasting?.ability || null;
    const spellcastingModifier = spellcastingAbility ? abilityMods[spellcastingAbility] : null;
    const spellSaveDC = spellcastingAbility ? 8 + proficiencyBonus + spellcastingModifier : null;
    const spellAttackBonus = spellcastingAbility ? proficiencyBonus + spellcastingModifier : null;

    const attacks = resolveAttacks({
        character,
        weaponsMap: compendium.weapons,
        weaponProficiencies,
        abilityMods,
        proficiencyBonus
    });

    const maxHp = resolveHitPoints({
        character,
        classDoc,
        race,
        abilityMods,
        level,
        featureIds
    });

    const passivePerception = 10
        + abilityMods.wis
        + (effectiveSkillProficiencies.includes('perception') ? proficiencyBonus : 0)
        + (expertiseProficiencies.includes('perception') ? proficiencyBonus : 0);
    const availableWeaponIds = [...compendium.weapons.values()]
        .filter((weapon) => hasWeaponProficiency(weapon, weaponProficiencies))
        .map((weapon) => weapon.id);
    const availableSpellIds = resolveAvailableSpellIds({ classDoc, level, spellsMap: compendium.spells });
    const resolvedSpells = resolveResolvedSpells({
        character,
        spellsMap: compendium.spells,
        level,
        spellSaveDC,
        spellAttackBonus
    });

    return {
        email: character.email,
        userName: character.userName,
        characterName: character.characterName,
        raceId: race?.id || character.raceId || '',
        raceName: race?.name || character.raceName || character.race || '',
        classId: classDoc?.id || character.classId || '',
        className: classDoc?.name || character.className || character.class || '',
        subclassId: subclass?.id || character.subclassId || '',
        subclassName: subclass?.name || character.subclassName || character.subclass || '',
        background: character.background || '',
        backgroundName: background?.name || character.background || '',
        alignment: character.alignment || '',
        level,
        xp: toNumber(character.xp, 0),
        baseAbilityScores,
        abilityScores,
        abilityMods,
        proficiencyBonus,
        speed: toNumber(character.speed, race?.speed || 30),
        passivePerception,
        initiative: abilityMods.dex,
        maxHp,
        currentHp: toNumber(character.currentHp, maxHp),
        tempHp: toNumber(character.tempHp, 0),
        hitDie: classDoc ? `d${classDoc.hitDie}` : '',
        hitDiceRemaining: toNumber(character.hitDiceRemaining, level),
        armorClass: resolveArmorClass({ armor, shield, abilityMods }),
        savingThrowProficiencies,
        savingThrows,
        skillProficiencies,
        backgroundSkillProficiencies,
        expertiseProficiencies,
        skillValues,
        weaponProficiencies,
        armorProficiencies,
        toolProficiencies: unique([...(character.toolProficiencies || []), ...(background?.toolProficiencies || [])]),
        languages: resolveLanguages(race, background, character),
        armorId: character.armorId || null,
        shieldId: character.shieldId || null,
        equippedWeaponIds: unique(character.equippedWeaponIds || []),
        availableWeaponIds,
        attacks,
        spellcasting: {
            classId: classDoc?.id || '',
            ability: spellcastingAbility,
            kind: classDoc?.spellcasting?.kind || null,
            // 'short' for Warlock pact slots; 'long' for all other casters.
            // Used by the client to display the correct rest type and to gate
            // slot refresh on short rest vs long rest.
            restRecovery: classDoc?.spellcasting?.restRecovery || 'long'
        },
        spellSlots,
        spellSaveDC,
        spellAttackBonus,
        availableSpellIds,
        knownSpellIds: unique(character.knownSpellIds || []),
        preparedSpellIds: unique(character.preparedSpellIds || []),
        cantripIds: unique(character.cantripIds || []),
        resolvedSpells,
        conditions: Array.isArray(character.conditions) ? character.conditions : [],
        deathSaves: character.deathSaves || { successes: 0, failures: 0 },
        currency: {
            cp: toNumber(character.currency?.cp, 0),
            sp: toNumber(character.currency?.sp, 0),
            ep: toNumber(character.currency?.ep, 0),
            gp: toNumber(character.currency?.gp, 0),
            pp: toNumber(character.currency?.pp, 0)
        },
        features: featureIds.map((featureId) => compendium.features.get(featureId)).filter(Boolean),
        featureIds,
        traits: character.traits || '',
        ideals: character.ideals || '',
        bonds: character.bonds || '',
        flaws: character.flaws || '',
        backstory: character.backstory || '',
        inventory: Array.isArray(character.inventory) ? character.inventory : [],
        equipment: Array.isArray(character.equipment) ? character.equipment : [],
        createdAt: character.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

module.exports = {
    buildCharacterDocument,
    getProficiencyBonus
};
