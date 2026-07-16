import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { getStoredItem, setStoredItem } from '../lib/storage';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './languages';
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
// NOTE on zh.json: CLDR defines only a single "other" plural category for
// Chinese (no "one" category exists), so every `_one` key in zh.json is
// unreachable at runtime -- i18next's pluralizer will never select it for
// this locale. Those `_one` entries are kept anyway (duplicating the
// `_other` text) purely so all five catalogs share an identical key set,
// which scripts/check-i18n.mjs verifies. This is intentional, not a bug.
import zh from './locales/zh.json';

/**
 * i18next + react-i18next, chosen over i18n-js for this app because
 * `useTranslation()` re-renders every subscribed component the instant
 * `changeLanguage()` resolves -- exactly the "no restart" requirement for
 * the in-app language picker -- without us hand-rolling a pub/sub layer
 * around a plain formatting library. It also gives us ICU-style
 * `{{interpolation}}` and CLDR pluralization (`_one`/`_other` keys) for
 * free, which the templated strings in this app (km, hour counts, spot
 * counts) need. The trade-off is a bit more bundle weight than i18n-js;
 * for a handful of screens that's a reasonable price for correctness.
 */

const STORAGE_KEY = 'aurora.language.v1';

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Maps a device locale tag (e.g. "de-DE", "zh-Hans-CN", "pt-BR") down to one
 * of the five catalogs we ship, falling back to English for anything else.
 * All Chinese variants (zh-Hans, zh-CN, zh-Hant, zh-TW, ...) collapse to the
 * single Simplified `zh` catalog -- there is no separate Traditional set.
 */
export function normalizeToSupportedLanguage(tag: string | null | undefined): SupportedLanguage {
  const lower = (tag ?? '').toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  return 'en';
}

function detectDeviceLanguage(): SupportedLanguage {
  try {
    const [first] = Localization.getLocales();
    return normalizeToSupportedLanguage(first?.languageTag ?? first?.languageCode ?? 'en');
  } catch {
    return 'en';
  }
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    zh: { translation: zh }
  },
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false
});

/**
 * Persisted manual language choice (see the language picker in
 * AllSpotsScreen) always wins over the device-detected locale once it has
 * loaded. Fails closed to the device/fallback language on any storage
 * error -- same "never throw into UI code" contract as lib/storage.ts.
 */
export async function loadPersistedLanguage(): Promise<void> {
  try {
    const stored = await getStoredItem(STORAGE_KEY);
    if (isSupportedLanguage(stored) && stored !== i18next.language) {
      await i18next.changeLanguage(stored);
    }
  } catch {
    // Keep the device-detected language; persistence is best-effort only.
  }
}

/**
 * Applies a language instantly -- every component using `useTranslation()`
 * re-renders -- and persists the choice so it survives app restarts.
 */
export async function setLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
  try {
    await setStoredItem(STORAGE_KEY, language);
  } catch {
    // Best-effort persistence only -- the language still applies this session.
  }
}

export function getCurrentLanguage(): SupportedLanguage {
  return normalizeToSupportedLanguage(i18next.language);
}

// Kick off the persisted-choice read as soon as this module is imported
// (transitively, from any screen that imports useTranslation), mirroring
// analytics/consent.ts's `void loadConsent()` pattern below.
void loadPersistedLanguage();

export { SUPPORTED_LANGUAGES, LANGUAGE_NATIVE_LABELS, type SupportedLanguage } from './languages';
export default i18next;
