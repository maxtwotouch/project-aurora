import type { Spot } from '../types';
import type { SupportedLanguage } from '../i18n/languages';

import rawSpotDescriptions from './spotDescriptions.json';

/**
 * English is canonical and lives on `Spot.description` in `spots.json` (the
 * backend imports that file, so it is never touched here). This module only
 * carries the four *translated* variants, keyed by spot id.
 *
 * Data lives in a plain `.json` file (rather than inline in this `.ts`
 * module) so `scripts/check-i18n.mjs` -- a dependency-free Node script, not
 * run through a TS/JSX loader -- can read it directly with `JSON.parse`,
 * the same way it already reads `src/i18n/locales/*.json`. This `.ts` file
 * is the sole typed entry point the app imports from.
 */
export type SpotDescriptionTranslations = {
  de: string;
  fr: string;
  es: string;
  zh: string;
};

export const spotDescriptions: Record<string, SpotDescriptionTranslations> = rawSpotDescriptions;

/**
 * Returns `spot.description` localized to `language`, falling back to the
 * canonical English text whenever:
 *  - `language` is `'en'` (English has no separate translation entry), or
 *  - the spot has no translations at all (e.g. a newly added spot before
 *    translations are backfilled -- `npm run test:i18n` will flag this), or
 *  - the specific language field is missing/empty for this spot.
 *
 * Callers must already invoke `useTranslation()` (or otherwise subscribe to
 * i18next) so the component re-renders when the language changes -- this
 * function itself does no subscribing, it just reads the current value.
 */
export function getLocalizedSpotDescription(spot: Spot, language: SupportedLanguage): string {
  if (language === 'en') return spot.description;

  const translations = spotDescriptions[spot.id];
  const translated = translations?.[language];
  return translated && translated.length > 0 ? translated : spot.description;
}
