import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const BASE_LOCALE = 'en';
const LOCALES = ['en', 'de', 'fr', 'es', 'zh'];

function fail(message) {
  console.error(`i18n check failed: ${message}`);
  process.exit(1);
}

function loadLocale(code) {
  const filePath = path.join(LOCALES_DIR, `${code}.json`);
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`could not read ${filePath}: ${error instanceof Error ? error.message : error}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${code}.json is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
}

/** Flattens a nested catalog object into dot-path keys mapped to their string leaf values. */
function flatten(obj, prefix = '') {
  const entries = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(entries, flatten(value, keyPath));
    } else {
      entries[keyPath] = value;
    }
  }
  return entries;
}

/** Extracts the set of {{variable}} interpolation tokens used in a string value. */
function interpolationVars(value) {
  if (typeof value !== 'string') return new Set();
  const matches = value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  return new Set([...matches].map((m) => m[1]));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function main() {
  const flattened = {};
  for (const code of LOCALES) {
    flattened[code] = flatten(loadLocale(code));
  }

  const baseKeys = new Set(Object.keys(flattened[BASE_LOCALE]));
  const problems = [];

  for (const code of LOCALES) {
    if (code === BASE_LOCALE) continue;

    const localeKeys = new Set(Object.keys(flattened[code]));

    const missing = [...baseKeys].filter((key) => !localeKeys.has(key));
    if (missing.length > 0) {
      problems.push(`${code}.json is missing ${missing.length} key(s): ${missing.join(', ')}`);
    }

    const extra = [...localeKeys].filter((key) => !baseKeys.has(key));
    if (extra.length > 0) {
      problems.push(`${code}.json has ${extra.length} extra key(s) not in en.json: ${extra.join(', ')}`);
    }

    for (const key of baseKeys) {
      if (!localeKeys.has(key)) continue; // already reported as missing above

      const baseVars = interpolationVars(flattened[BASE_LOCALE][key]);
      const localeVars = interpolationVars(flattened[code][key]);

      if (!setsEqual(baseVars, localeVars)) {
        problems.push(
          `${code}.json key "${key}" has interpolation variables {${[...localeVars].join(', ')}} ` +
            `but en.json has {${[...baseVars].join(', ')}}`
        );
      }
    }
  }

  if (problems.length > 0) {
    fail(`\n  - ${problems.join('\n  - ')}`);
  }

  console.log(
    `i18n check OK. ${LOCALES.length} locales, ${baseKeys.size} keys each, no missing/extra keys, no interpolation drift.`
  );
}

main();
