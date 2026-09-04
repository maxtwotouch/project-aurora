// Tests for the pure BCP 47 tag helper in src/i18n/languages.ts -- no
// expo-localization / react-i18next import (that lives in src/i18n/index.ts),
// so this runs the same way under plain node:test as nightKey.test.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NATIVE_LABELS,
  htmlLangFor
} from '../src/i18n/languages.js';

describe('htmlLangFor', () => {
  test('every supported language yields a non-empty BCP 47-looking tag', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const tag = htmlLangFor(language);
      assert.ok(tag.length > 0);
      assert.match(tag, /^[a-zA-Z]+(-[a-zA-Z]+)*$/);
    }
  });

  test("'zh' maps to 'zh-Hans'", () => {
    assert.equal(htmlLangFor('zh'), 'zh-Hans');
  });

  test('en, de, fr, es map to themselves', () => {
    assert.equal(htmlLangFor('en'), 'en');
    assert.equal(htmlLangFor('de'), 'de');
    assert.equal(htmlLangFor('fr'), 'fr');
    assert.equal(htmlLangFor('es'), 'es');
  });

  test('every supported language has a native label', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const label = LANGUAGE_NATIVE_LABELS[language];
      assert.ok(typeof label === 'string' && label.length > 0);
    }
  });
});
