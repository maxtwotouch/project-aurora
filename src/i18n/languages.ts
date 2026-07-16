/**
 * The five catalogs shipped with the app. Locale codes are the plain
 * ISO 639-1 tag used as the i18next language key (see index.ts for how
 * device tags like `de-DE` or `zh-Hans-CN` collapse down to these).
 */
export const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'es', 'zh'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Each language labeled in its own tongue (not translated), so a reader can
 * recognize their language regardless of the app's current UI language.
 */
export const LANGUAGE_NATIVE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  zh: '中文'
};
