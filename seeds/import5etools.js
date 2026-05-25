const fs = require('fs');
const path = require('path');

const SCHOOL_MAP = {
    A: 'Abjuration',
    C: 'Conjuration',
    D: 'Divination',
    E: 'Enchantment',
    V: 'Evocation',
    I: 'Illusion',
    N: 'Necromancy',
    T: 'Transmutation',
    P: 'Psionic'
};

const DAMAGE_TYPE_MAP = {
    A: 'acid',
    B: 'bludgeoning',
    C: 'cold',
    F: 'fire',
    I: 'poison',
    L: 'lightning',
    N: 'necrotic',
    O: 'force',
    P: 'piercing',
    R: 'radiant',
    S: 'slashing',
    T: 'thunder'
};

const WEAPON_PROPERTY_MAP = {
    '2H': 'two-handed',
    A: 'ammunition',
    AF: 'auto-fire',
    BF: 'burst-fire',
    F: 'finesse',
    H: 'heavy',
    L: 'light',
    LD: 'loading',
    R: 'reach',
    RLD: 'reload',
    S: 'special',
    T: 'thrown',
    V: 'versatile'
};

const ARMOR_CATEGORY_MAP = {
    HA: 'heavy',
    LA: 'light',
    MA: 'medium',
    S: 'shield'
};

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
}

function uniqueById(documents) {
    const seen = new Map();

    for (const document of documents || []) {
        if (document?.id) {
            seen.set(document.id, document);
        }
    }

    return [...seen.values()];
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function isClassic(doc) {
    if (!doc) {
        return false;
    }

    if (doc.edition && doc.edition !== 'classic') {
        return false;
    }

    return !String(doc.source || '').startsWith('UA');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .replace(/\{@[a-zA-Z]+ ([^}|]+)\|[^}]*\}/g, '$1')
        .replace(/\{@[a-zA-Z]+ ([^}]+)\}/g, '$1')
        .replace(/\{@[^}]+\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function flattenEntries(entries) {
    const lines = [];

    for (const entry of toArray(entries)) {
        if (typeof entry === 'string') {
            const cleaned = cleanText(entry);

            if (cleaned) {
                lines.push(cleaned);
            }

            continue;
        }

        if (!entry || typeof entry !== 'object') {
            continue;
        }

        if (entry.name) {
            lines.push(cleanText(entry.name));
        }

        if (entry.entries) {
            lines.push(...flattenEntries(entry.entries));
        }

        // List-type entries use "items" instead of "entries" (e.g. feat bullet points)
        if (entry.items) {
            lines.push(...flattenEntries(entry.items));
        }
    }

    return lines.filter(Boolean);
}

function parseAbilityBonuses(ability) {
    const bonuses = {};
    const first = toArray(ability)[0];

    if (!first || typeof first !== 'object') {
        return bonuses;
    }

    for (const [key, value] of Object.entries(first)) {
        if (typeof value === 'number') {
            bonuses[key] = value;
        }
    }

    return bonuses;
}

function mergeAbilityBonuses(...sources) {
    const merged = {};

    for (const source of sources) {
        for (const [key, value] of Object.entries(source || {})) {
            merged[key] = (merged[key] || 0) + value;
        }
    }

    return merged;
}

function extractLanguages(proficiencies) {
    const languages = [];

    for (const entry of toArray(proficiencies)) {
        for (const [key, value] of Object.entries(entry || {})) {
            // "choose": {...} — race-style language choice
            if (key === 'choose' && value) {
                languages.push('Choice');
                continue;
            }

            // "anyStandard": N — background-style "pick N standard languages"
            // Push one "Choice" token per slot so the UI knows how many picks are available
            if ((key === 'anyStandard' || key === 'any') && typeof value === 'number') {
                for (let i = 0; i < value; i += 1) {
                    languages.push('Choice');
                }

                continue;
            }

            if (value === true) {
                languages.push(cleanText(key));
            }
        }
    }

    return unique(languages.map((language) => {
        if (language.length <= 3) {
            return language.toUpperCase();
        }

        return language.charAt(0).toUpperCase() + language.slice(1);
    }));
}

function normalizeLinkedId(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const rawValue = value
        .replace(/\{@item /g, '')
        .replace(/\}/g, '')
        .split('|')[0]
        .replace(/\b(simple|martial|light|medium|heavy)\s+weapons?\b/i, '$1')
        .replace(/\bshields?\b/i, 'shield')
        .trim();

    return slugify(rawValue);
}

function extractProficiencyIds(entries) {
    const ids = [];

    for (const entry of toArray(entries)) {
        if (typeof entry === 'string') {
            const normalized = normalizeLinkedId(entry);

            if (normalized) {
                ids.push(normalized);
            }

            continue;
        }

        for (const [key, value] of Object.entries(entry || {})) {
            if (key === 'choose') {
                continue;
            }

            if (value === true) {
                ids.push(normalizeLinkedId(key));
            }
        }
    }

    return unique(ids);
}

function extractSkillChoiceRules(skills) {
    const firstChoice = toArray(skills)
        .map((entry) => entry?.choose)
        .find(Boolean);

    if (!firstChoice) {
        return {
            choose: 0,
            options: []
        };
    }

    return {
        choose: Number(firstChoice.count || 0),
        options: toArray(firstChoice.from || []).map((skill) => cleanText(skill))
    };
}

function buildSpellSlotProgression(classDoc) {
    const slotTable = toArray(classDoc.classTableGroups)
        .find((group) => group.title === 'Spell Slots per Spell Level' && Array.isArray(group.rowsSpellProgression));

    if (!slotTable) {
        return {};
    }

    return slotTable.rowsSpellProgression.reduce((accumulator, row, index) => {
        const level = String(index + 1);
        accumulator[level] = {};

        row.forEach((slotCount, slotIndex) => {
            if (slotCount > 0) {
                accumulator[level][`level_${slotIndex + 1}`] = slotCount;
            }
        });

        return accumulator;
    }, {});
}

function buildCantripProgression(classDoc) {
    const progression = {};

    toArray(classDoc.cantripProgression).forEach((count, index) => {
        if (!Object.values(progression).includes(count)) {
            progression[String(index + 1)] = count;
        }
    });

    return progression;
}

function getSpellcastingKind(classDoc) {
    if (!classDoc.spellcastingAbility) {
        return null;
    }

    if (classDoc.preparedSpells) {
        return 'prepared';
    }

    return 'known';
}

function formatCastingTime(time) {
    const first = toArray(time)[0];

    if (!first) {
        return '';
    }

    return `${first.number} ${first.unit}`;
}

function formatRange(range) {
    if (!range) {
        return '';
    }

    if (typeof range === 'string') {
        return range;
    }

    if (range.type === 'point' && range.distance) {
        if (range.distance.type === 'self') {
            return 'Self';
        }

        if (range.distance.amount) {
            return `${range.distance.amount} ${range.distance.type}`;
        }
    }

    if (range.type === 'self') {
        return 'Self';
    }

    return cleanText(JSON.stringify(range));
}

function formatDuration(duration) {
    const first = toArray(duration)[0];

    if (!first) {
        return '';
    }

    if (first.type === 'instant') {
        return 'Instantaneous';
    }

    if (first.duration && first.duration.amount) {
        return `${first.duration.amount} ${first.duration.type}`;
    }

    if (first.type) {
        return cleanText(first.type);
    }

    return '';
}

function formatComponents(components) {
    if (!components || typeof components !== 'object') {
        return [];
    }

    const result = [];

    if (components.v) {
        result.push('V');
    }

    if (components.s) {
        result.push('S');
    }

    if (components.m) {
        result.push(typeof components.m === 'string' ? `M (${components.m})` : 'M');
    }

    return result;
}

function extractAttackType(lines) {
    const text = lines.join(' ').toLowerCase();

    if (text.includes('ranged spell attack')) {
        return 'rangedSpellAttack';
    }

    if (text.includes('melee spell attack')) {
        return 'meleeSpellAttack';
    }

    return null;
}

function extractBaseDamage(lines) {
    const match = lines.join(' ').match(/\b(\d+d\d+)\b/i);
    return match ? match[1] : null;
}

function parseScaledDamage(entryText) {
    const match = entryText.match(/\{@scaledamage ([^|]+)\|(\d)-(\d)\|([^}]+)\}/);

    if (!match) {
        return {};
    }

    const [, baseDice, startLevel, endLevel, incrementDice] = match;
    const diceMatch = baseDice.match(/(\d+)d(\d+)/i);
    const incrementMatch = incrementDice.match(/(\d+)d(\d+)/i);

    if (!diceMatch || !incrementMatch || diceMatch[2] !== incrementMatch[2]) {
        return {};
    }

    const scaling = {};
    const startingCount = Number(diceMatch[1]);
    const dieFaces = diceMatch[2];
    const incrementCount = Number(incrementMatch[1]);

    for (let slotLevel = Number(startLevel) + 1; slotLevel <= Number(endLevel); slotLevel += 1) {
        const nextCount = startingCount + incrementCount * (slotLevel - Number(startLevel));
        scaling[String(slotLevel)] = `${nextCount}d${dieFaces}`;
    }

    return scaling;
}

function extractSpellScaling(spell) {
    if (spell.scalingLevelDice?.scaling) {
        return spell.scalingLevelDice.scaling;
    }

    for (const entry of toArray(spell.entriesHigherLevel)) {
        for (const line of flattenEntries(entry.entries)) {
            const scaling = parseScaledDamage(line);

            if (Object.keys(scaling).length > 0) {
                return scaling;
            }
        }
    }

    return {};
}

function getSpellClasses(spell, lookup) {
    const bySource = lookup[String(spell.source || '').toLowerCase()] || {};
    const byName = bySource[String(spell.name || '').toLowerCase()] || {};
    const classGroups = byName.class || {};

    return unique(
        Object.values(classGroups)
            .flatMap((group) => Object.keys(group))
            .map((className) => slugify(className))
    );
}

function normalizeDamageType(value) {
    if (!value) {
        return null;
    }

    if (String(value).length === 1) {
        return DAMAGE_TYPE_MAP[String(value).toUpperCase()] || String(value).toLowerCase();
    }

    return String(value).toLowerCase();
}

function normalizeSaveType(value) {
    const normalized = String(value || '').toLowerCase();

    if (normalized.startsWith('dex')) {
        return 'dex';
    }

    if (normalized.startsWith('str')) {
        return 'str';
    }

    if (normalized.startsWith('con')) {
        return 'con';
    }

    if (normalized.startsWith('int')) {
        return 'int';
    }

    if (normalized.startsWith('wis')) {
        return 'wis';
    }

    if (normalized.startsWith('cha')) {
        return 'cha';
    }

    return normalized || null;
}

function getFeatureKey(feature) {
    if (feature.subclassShortName) {
        return [
            cleanText(feature.name),
            cleanText(feature.className),
            cleanText(feature.classSource),
            cleanText(feature.subclassShortName),
            cleanText(feature.subclassSource),
            String(feature.level)
        ].join('|').toLowerCase();
    }

    return [
        cleanText(feature.name),
        cleanText(feature.className),
        cleanText(feature.classSource),
        String(feature.level)
    ].join('|').toLowerCase();
}

function parseFeatureReference(reference) {
    if (!reference || typeof reference !== 'string') {
        return null;
    }

    const parts = reference.split('|');

    if (parts.length >= 6) {
        return {
            kind: 'subclass',
            key: [
                cleanText(parts[0]),
                cleanText(parts[1]),
                cleanText(parts[2] || 'PHB'),
                cleanText(parts[3]),
                cleanText(parts[4] || 'PHB'),
                cleanText(parts[5])
            ].join('|').toLowerCase()
        };
    }

    if (parts.length >= 4) {
        return {
            kind: 'class',
            key: [
                cleanText(parts[0]),
                cleanText(parts[1]),
                cleanText(parts[2] || 'PHB'),
                cleanText(parts[3])
            ].join('|').toLowerCase()
        };
    }

    return null;
}

function getDisplayRaceName(baseRace, subrace) {
    if (!subrace) {
        return baseRace.name;
    }

    const subraceName = String(subrace.name || '').trim();
    const raceName = String(subrace.raceName || baseRace.name || '').trim();

    if (Array.isArray(subrace.alias) && subrace.alias.length > 0) {
        return subraceName || baseRace.name;
    }

    if (
        raceName
        && subraceName
        && !subraceName.toLowerCase().includes(raceName.toLowerCase())
        && !['drow', 'aasimar', 'genasi'].includes(subraceName.toLowerCase())
    ) {
        return `${subraceName} ${baseRace.name}`;
    }

    return subraceName || baseRace.name;
}

function buildRaceFeatures(raceDoc, sourceType, sourceId) {
    if (!raceDoc) {
        return [];
    }

    const features = [];

    for (const entry of toArray(raceDoc.entries)) {
        if (!entry?.name) {
            continue;
        }

        features.push({
            id: `${sourceId}--${slugify(entry.name)}`,
            sourceType,
            sourceId,
            level: 1,
            name: cleanText(entry.name),
            effects: flattenEntries(entry.entries)
        });
    }

    return features;
}

function getMergedRace(baseRace, subrace) {
    const name = getDisplayRaceName(baseRace, subrace);
    const id = slugify(name);
    const raceFeatures = [
        ...buildRaceFeatures(baseRace, 'race', id),
        ...buildRaceFeatures(subrace, 'race', id)
    ];

    return {
        document: {
            id,
            name,
            speed: subrace?.speed?.walk || baseRace.speed?.walk || 30,
            size: cleanText((subrace?.size || baseRace.size || ['M'])[0]),
            abilityBonuses: mergeAbilityBonuses(
                parseAbilityBonuses(baseRace.ability),
                parseAbilityBonuses(subrace?.ability)
            ),
            languages: unique([
                ...extractLanguages(baseRace.languageProficiencies),
                ...extractLanguages(subrace?.languageProficiencies)
            ]),
            traits: unique([
                ...toArray(baseRace.entries).map((entry) => entry?.name).filter(Boolean),
                ...toArray(subrace?.entries).map((entry) => entry?.name).filter(Boolean)
            ]),
            weaponProficiencies: unique([
                ...extractProficiencyIds(baseRace.weaponProficiencies),
                ...extractProficiencyIds(subrace?.weaponProficiencies)
            ]),
            spellGrants: [],
            featureIds: raceFeatures.map((feature) => feature.id)
        },
        features: raceFeatures
    };
}

function getImportedRaces(dataDir) {
    const raceData = readJson(path.join(dataDir, 'races.json'));
    const baseRaces = toArray(raceData.race).filter(isClassic);
    const subraces = toArray(raceData.subrace).filter(isClassic);
    const subraceGroups = subraces.reduce((accumulator, subrace) => {
        const key = `${subrace.raceName}|${subrace.raceSource || subrace.source}`;
        accumulator[key] ||= [];
        accumulator[key].push(subrace);
        return accumulator;
    }, {});

    const races = [];
    const features = [];

    for (const baseRace of baseRaces) {
        const key = `${baseRace.name}|${baseRace.source}`;
        const matchingSubraces = subraceGroups[key] || [];

        if (matchingSubraces.length > 0) {
            for (const subrace of matchingSubraces) {
                const merged = getMergedRace(baseRace, subrace);
                races.push(merged.document);
                features.push(...merged.features);
            }

            continue;
        }

        const merged = getMergedRace(baseRace, null);
        races.push(merged.document);
        features.push(...merged.features);
    }

    return { races, raceFeatures: features };
}

function getImportedClasses(dataDir) {
    const classDir = path.join(dataDir, 'class');
    const fileNames = fs.readdirSync(classDir)
        .filter((fileName) => /^class-.*\.json$/i.test(fileName) && !/^fluff-/i.test(fileName));

    const classes = [];
    const subclasses = [];
    const features = [];
    const featureLookup = new Map();

    const rawClassFiles = fileNames.map((fileName) => readJson(path.join(classDir, fileName)));

    for (const file of rawClassFiles) {
        for (const classFeature of toArray(file.classFeature).filter(isClassic)) {
            const feature = {
                id: `${slugify(classFeature.className)}--${slugify(classFeature.name)}--${classFeature.level}`,
                sourceType: 'class',
                sourceId: slugify(classFeature.className),
                level: Number(classFeature.level || 1),
                name: cleanText(classFeature.name),
                effects: flattenEntries(classFeature.entries)
            };

            featureLookup.set(getFeatureKey(classFeature), feature);
            features.push(feature);
        }

        for (const subclassFeature of toArray(file.subclassFeature).filter(isClassic)) {
            const subclassId = slugify(subclassFeature.subclassShortName || subclassFeature.name);
            const feature = {
                id: `${subclassId}--${slugify(subclassFeature.name)}--${subclassFeature.level}`,
                sourceType: 'subclass',
                sourceId: subclassId,
                level: Number(subclassFeature.level || 1),
                name: cleanText(subclassFeature.name),
                effects: flattenEntries(subclassFeature.entries)
            };

            featureLookup.set(getFeatureKey(subclassFeature), feature);
            features.push(feature);
        }
    }

    for (const file of rawClassFiles) {
        for (const classDoc of toArray(file.class).filter(isClassic)) {
            if (['Mystic', 'Sidekick'].includes(classDoc.name)) {
                continue;
            }

            const classId = slugify(classDoc.name);
            const levelProgression = {};

            toArray(classDoc.classFeatures).forEach((featureReference, index) => {
                const referenceValue = typeof featureReference === 'string'
                    ? featureReference
                    : featureReference?.classFeature;
                const parsedReference = parseFeatureReference(referenceValue);
                const resolvedFeature = parsedReference ? featureLookup.get(parsedReference.key) : null;

                if (!resolvedFeature) {
                    return;
                }

                const level = String(index + 1);
                levelProgression[level] ||= { featureIds: [] };
                levelProgression[level].featureIds.push(resolvedFeature.id);
            });

            classes.push({
                id: classId,
                name: classDoc.name,
                hitDie: Number(classDoc.hd?.faces || 0),
                primaryAbilities: unique([
                    classDoc.spellcastingAbility,
                    ...toArray(classDoc.proficiency)
                ].filter(Boolean)),
                savingThrowProficiencies: toArray(classDoc.proficiency),
                armorProficiencies: extractProficiencyIds(classDoc.startingProficiencies?.armor),
                weaponProficiencies: extractProficiencyIds(classDoc.startingProficiencies?.weapons),
                skillChoiceRules: extractSkillChoiceRules(classDoc.startingProficiencies?.skills),
                spellcasting: classDoc.spellcastingAbility
                    ? {
                        ability: classDoc.spellcastingAbility,
                        kind: getSpellcastingKind(classDoc),
                        preparedFormula: classDoc.preparedSpells || null,
                        spellSlotsByLevel: buildSpellSlotProgression(classDoc),
                        cantripsKnownByLevel: buildCantripProgression(classDoc)
                    }
                    : null,
                levelProgression
            });
        }

        for (const subclassDoc of toArray(file.subclass).filter(isClassic)) {
            const classId = slugify(subclassDoc.className);
            const subclassId = slugify(subclassDoc.shortName || subclassDoc.name);
            const levelFeatures = {};

            toArray(subclassDoc.subclassFeatures).forEach((featureReference) => {
                const parsedReference = parseFeatureReference(featureReference);
                const resolvedFeature = parsedReference ? featureLookup.get(parsedReference.key) : null;

                if (!resolvedFeature) {
                    return;
                }

                const level = String(resolvedFeature.level);
                levelFeatures[level] ||= [];
                levelFeatures[level].push(resolvedFeature.id);
            });

            subclasses.push({
                id: subclassId,
                classId,
                name: subclassDoc.name,
                levelFeatures
            });
        }
    }

    return { classes, subclasses, classFeatures: features };
}

function getImportedSpells(dataDir) {
    const spellsDir = path.join(dataDir, 'spells');
    const lookup = readJson(path.join(dataDir, 'generated', 'gendata-spell-source-lookup.json'));
    const fileNames = fs.readdirSync(spellsDir)
        .filter((fileName) => /^spells-.*\.json$/i.test(fileName) && !/^fluff-/i.test(fileName));

    const spells = [];

    for (const fileName of fileNames) {
        const file = readJson(path.join(spellsDir, fileName));

        for (const spell of toArray(file.spell).filter(isClassic)) {
            const lines = flattenEntries(spell.entries);
            const scaling = extractSpellScaling(spell);

            spells.push({
                id: slugify(spell.name),
                name: spell.name,
                level: Number(spell.level || 0),
                school: SCHOOL_MAP[spell.school] || spell.school,
                classes: getSpellClasses(spell, lookup),
                castingTime: formatCastingTime(spell.time),
                range: formatRange(spell.range),
                components: formatComponents(spell.components),
                duration: formatDuration(spell.duration),
                damage: extractBaseDamage(lines)
                    ? {
                        base: extractBaseDamage(lines),
                        type: normalizeDamageType(toArray(spell.damageInflict)[0])
                    }
                    : null,
                saveType: normalizeSaveType(toArray(spell.savingThrow)[0]),
                attackType: extractAttackType(lines),
                scaling,
                description: lines.join(' ')
            });
        }
    }

    return spells;
}

function parseRange(range) {
    if (!range) {
        return null;
    }

    if (typeof range === 'string' && /^\d+\/\d+$/.test(range)) {
        const [normal, long] = range.split('/').map(Number);
        return { normal, long };
    }

    return null;
}

function getImportedEquipment(dataDir) {
    const items = readJson(path.join(dataDir, 'items-base.json'));
    const weapons = [];
    const armor = [];

    for (const item of toArray(items.baseitem).filter(isClassic)) {
        if (item.weapon) {
            const properties = toArray(item.property).map((property) => {
                const [code] = String(property).split('|');
                return WEAPON_PROPERTY_MAP[code] || slugify(code);
            });

            weapons.push({
                id: slugify(item.name),
                name: item.name,
                category: cleanText(item.weaponCategory || '').toLowerCase(),
                weaponType: item.type === 'R' ? 'ranged' : 'melee',
                damageDice: item.dmg1 || null,
                damageType: DAMAGE_TYPE_MAP[item.dmgType] || item.dmgType,
                properties,
                range: parseRange(item.range),
                finesse: properties.includes('finesse'),
                twoHanded: properties.includes('two-handed'),
                versatileDice: item.dmg2 || null,
                proficientClasses: [],
                proficientRaces: []
            });
        }

        if (item.armor || item.type === 'S') {
            const category = ARMOR_CATEGORY_MAP[item.type];

            if (!category) {
                continue;
            }

            armor.push({
                id: slugify(item.name),
                name: item.name,
                category,
                baseAc: Number(item.ac || 0),
                dexCap: category === 'medium' ? 2 : (category === 'heavy' ? 0 : null),
                strengthRequirement: item.strength ? Number(item.strength) : null,
                stealthDisadvantage: Boolean(item.stealth)
            });
        }
    }

    return { weapons, armor };
}

// --- Backgrounds ---
// Extracts skill proficiencies, language proficiencies, and tool proficiencies
// from the 5etools backgrounds format into flat arrays the API understands.
function extractSkillProficiencies(skillProficiencies) {
    const skills = [];

    for (const entry of toArray(skillProficiencies)) {
        for (const [skill, value] of Object.entries(entry || {})) {
            if (value === true) {
                skills.push(slugify(skill));
            }
        }
    }

    return unique(skills);
}

function extractToolProficiencies(toolProficiencies) {
    const tools = [];

    for (const entry of toArray(toolProficiencies)) {
        for (const [tool, value] of Object.entries(entry || {})) {
            if (value === true && tool !== 'choose') {
                tools.push(cleanText(tool));
            }
        }
    }

    return unique(tools);
}

function getImportedBackgrounds(dataDir) {
    const bgData = readJson(path.join(dataDir, 'backgrounds.json'));
    const backgrounds = [];

    for (const bg of toArray(bgData.background).filter(isClassic)) {
        backgrounds.push({
            id: slugify(bg.name),
            name: bg.name,
            source: bg.source || 'PHB',
            skillProficiencies: extractSkillProficiencies(bg.skillProficiencies),
            languages: extractLanguages(bg.languageProficiencies),
            toolProficiencies: extractToolProficiencies(bg.toolProficiencies),
            description: flattenEntries(bg.entries).join(' ')
        });
    }

    return backgrounds;
}

// --- Feats ---
// Flattens prerequisite objects into a human-readable string so the UI
// can display it without needing to decode the 5etools schema.
function parsePrerequisiteText(prerequisite) {
    if (!prerequisite || !Array.isArray(prerequisite) || prerequisite.length === 0) {
        return null;
    }

    const parts = [];

    for (const req of prerequisite) {
        if (req.level) {
            parts.push(`Level ${req.level}`);
        }

        if (Array.isArray(req.race)) {
            const raceNames = req.race
                .map((r) => cleanText(r.name || r.raceName || ''))
                .filter(Boolean);

            if (raceNames.length > 0) {
                parts.push(raceNames.join(' or '));
            }
        }

        if (Array.isArray(req.ability)) {
            for (const ab of req.ability) {
                for (const [key, val] of Object.entries(ab || {})) {
                    parts.push(`${key.toUpperCase()} ${val}+`);
                }
            }
        }

        if (req.spellcasting) {
            parts.push('Spellcasting ability');
        }

        if (req.proficiency) {
            parts.push('Proficiency required');
        }

        if (req.feat) {
            const featNames = toArray(req.feat)
                .map((f) => cleanText(String(f).split('|')[0]))
                .filter(Boolean);

            if (featNames.length > 0) {
                parts.push(featNames.join(' or '));
            }
        }

        if (typeof req.other === 'string') {
            parts.push(cleanText(req.other));
        }
    }

    return parts.length > 0 ? parts.join(', ') : null;
}

function getImportedFeats(dataDir) {
    const featData = readJson(path.join(dataDir, 'feats.json'));
    const feats = [];

    for (const feat of toArray(featData.feat).filter(isClassic)) {
        feats.push({
            id: slugify(feat.name),
            name: feat.name,
            source: feat.source || 'PHB',
            prerequisite: parsePrerequisiteText(feat.prerequisite),
            abilityBonus: parseAbilityBonuses(feat.ability),
            description: flattenEntries(feat.entries).join(' ')
        });
    }

    return feats;
}

// --- Conditions ---
// The 5etools file has duplicates (one per source reprint). We dedupe by name
// and keep the first occurrence, which is always the PHB/SRD version.
function getImportedConditions(dataDir) {
    const condData = readJson(path.join(dataDir, 'conditionsdiseases.json'));
    const seen = new Set();
    const conditions = [];

    for (const cond of toArray(condData.condition)) {
        if (seen.has(cond.name)) {
            continue;
        }

        seen.add(cond.name);

        conditions.push({
            id: slugify(cond.name),
            name: cond.name,
            description: flattenEntries(cond.entries).join(' ')
        });
    }

    return conditions;
}

function load5eToolsCompendium(dataDir) {
    const { races, raceFeatures } = getImportedRaces(dataDir);
    const { classes, subclasses, classFeatures } = getImportedClasses(dataDir);
    const spells = getImportedSpells(dataDir);
    const { weapons, armor } = getImportedEquipment(dataDir);
    const backgrounds = getImportedBackgrounds(dataDir);
    const feats = getImportedFeats(dataDir);
    const conditions = getImportedConditions(dataDir);

    return [
        { collection: 'Races', key: 'id', documents: races },
        { collection: 'Classes', key: 'id', documents: classes },
        { collection: 'Subclasses', key: 'id', documents: subclasses },
        { collection: 'Spells', key: 'id', documents: spells },
        { collection: 'Weapons', key: 'id', documents: weapons },
        { collection: 'Armor', key: 'id', documents: armor },
        { collection: 'Features', key: 'id', documents: uniqueById([...raceFeatures, ...classFeatures]) },
        { collection: 'Backgrounds', key: 'id', documents: backgrounds },
        { collection: 'Feats', key: 'id', documents: feats },
        { collection: 'Conditions', key: 'id', documents: conditions }
    ];
}

module.exports = {
    load5eToolsCompendium
};
