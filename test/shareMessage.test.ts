// Tests for the pure share-message builder in src/share/shareMessage.ts (the
// "send tonight to a friend" viral-loop feature). No react-native /
// react-i18next import anywhere in this file's dependency graph -- mirrors
// test/alertsClient.test.ts's coverage of src/notifications/alertsClient.ts,
// which this module's own header comment cites as its structural twin.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildShareMessage, buildShareUrl, type ShareTonightState } from '../src/share/shareMessage.js';
import { SUPPORTED_LANGUAGES } from '../src/i18n/languages.js';

function makeState(overrides: Partial<ShareTonightState> = {}): ShareTonightState {
  return {
    seasonClosed: false,
    seasonReturns: null,
    bestSpotName: 'Ersfjordbotn',
    score: 82,
    bestWindowStart: '2026-08-02T20:00:00.000Z',
    bestWindowEnd: '2026-08-02T23:00:00.000Z',
    ...overrides
  };
}

describe('shareMessage: buildShareUrl', () => {
  test('defaults to the "share" channel slug', () => {
    assert.equal(buildShareUrl(), 'https://aurora.hovding.dev/go.html?src=share');
  });

  test('accepts a custom channel slug', () => {
    assert.equal(buildShareUrl('hotel-qr'), 'https://aurora.hovding.dev/go.html?src=hotel-qr');
  });
});

describe('shareMessage: buildShareMessage (tonight has data)', () => {
  test('includes the best spot name, the link, and the share channel param', () => {
    const { text, url } = buildShareMessage(makeState(), { language: 'en' });
    assert.match(text, /Ersfjordbotn/);
    assert.match(text, /https:\/\/aurora\.hovding\.dev\/go\.html\?src=share/);
    assert.equal(url, 'https://aurora.hovding.dev/go.html?src=share');
    assert.ok(text.includes(url));
  });

  test('is short: exactly two copy lines plus the link line', () => {
    const { text } = buildShareMessage(makeState(), { language: 'en' });
    assert.equal(text.split('\n').length, 3);
  });

  test('renders best-window times as HH:MM (24h), not raw ISO strings', () => {
    const { text } = buildShareMessage(makeState(), { language: 'en' });
    assert.doesNotMatch(text, /2026-08-02T/);
    assert.match(text, /\d{2}:\d{2}.*\d{2}:\d{2}/);
  });

  test('a high score (>=70) picks the "great chance" phrasing', () => {
    const { text } = buildShareMessage(makeState({ score: 82 }), { language: 'en' });
    assert.match(text, /Great chance/);
  });

  test('a medium score (45-69) picks the "might be visible" phrasing', () => {
    const { text } = buildShareMessage(makeState({ score: 55 }), { language: 'en' });
    assert.match(text, /might be visible/);
  });

  test('a low score (<45) picks the "looks low" phrasing', () => {
    const { text } = buildShareMessage(makeState({ score: 20 }), { language: 'en' });
    assert.match(text, /look low/);
  });

  test('respects a custom channel slug in the embedded link', () => {
    const { text, url } = buildShareMessage(makeState(), { language: 'en', channel: 'hotel-qr' });
    assert.match(text, /src=hotel-qr/);
    assert.equal(url, 'https://aurora.hovding.dev/go.html?src=hotel-qr');
  });
});

describe('shareMessage: buildShareMessage (season closed)', () => {
  test('uses season-closed flavored copy instead of a score', () => {
    const { text } = buildShareMessage(makeState({ seasonClosed: true, seasonReturns: '2026-08-14' }), {
      language: 'en'
    });
    assert.match(text, /season is closed/i);
    assert.doesNotMatch(text, /Great chance/);
  });

  test('renders the seasonReturns date in the message', () => {
    const { text } = buildShareMessage(makeState({ seasonClosed: true, seasonReturns: '2026-08-14' }), {
      language: 'en'
    });
    assert.match(text, /August 14/);
  });

  test('falls back to a generic "later this year" phrase when seasonReturns is unknown', () => {
    const { text } = buildShareMessage(makeState({ seasonClosed: true, seasonReturns: null }), { language: 'en' });
    assert.match(text, /later this year/);
  });

  test('ignores any score/spot data present alongside seasonClosed', () => {
    const { text } = buildShareMessage(
      makeState({ seasonClosed: true, seasonReturns: '2026-08-14', score: 90, bestSpotName: 'Ersfjordbotn' }),
      { language: 'en' }
    );
    assert.doesNotMatch(text, /Ersfjordbotn/);
  });
});

describe('shareMessage: buildShareMessage (missing snapshot)', () => {
  test('falls back to a generic invite message when there is no best spot yet', () => {
    const { text, url } = buildShareMessage(
      makeState({ bestSpotName: null, score: null, bestWindowStart: null, bestWindowEnd: null }),
      { language: 'en' }
    );
    assert.match(text, /Thinking about the northern lights/);
    assert.ok(text.includes(url));
  });

  test('falls back to generic when only the score is missing (partial snapshot)', () => {
    const { text } = buildShareMessage(makeState({ score: null }), { language: 'en' });
    assert.match(text, /Thinking about the northern lights/);
  });

  test('never throws on an all-missing state', () => {
    assert.doesNotThrow(() =>
      buildShareMessage(
        { seasonClosed: false, seasonReturns: null, bestSpotName: null, score: null, bestWindowStart: null, bestWindowEnd: null },
        { language: 'en' }
      )
    );
  });
});

describe('shareMessage: per-locale smoke test', () => {
  test('renders in every supported language without throwing, non-empty, and with the link present', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { text, url } = buildShareMessage(makeState(), { language });
      assert.ok(text.length > 0, `${language}: empty text`);
      assert.ok(text.includes(url), `${language}: missing link`);
      assert.doesNotMatch(text, /\{\{/, `${language}: leftover interpolation token`);
    }
  });

  test('renders the season-closed variant in every supported language without throwing or leftover tokens', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { text } = buildShareMessage(makeState({ seasonClosed: true, seasonReturns: '2026-08-14' }), {
        language
      });
      assert.ok(text.length > 0, `${language}: empty text`);
      assert.doesNotMatch(text, /\{\{/, `${language}: leftover interpolation token`);
    }
  });

  test('renders the generic (missing-data) variant in every supported language without throwing or leftover tokens', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { text } = buildShareMessage(
        makeState({ bestSpotName: null, score: null, bestWindowStart: null, bestWindowEnd: null }),
        { language }
      );
      assert.ok(text.length > 0, `${language}: empty text`);
      assert.doesNotMatch(text, /\{\{/, `${language}: leftover interpolation token`);
    }
  });

  test('non-English catalogs produce visibly different text from English for the main "tonight" variant', () => {
    const en = buildShareMessage(makeState(), { language: 'en' });
    for (const language of ['de', 'fr', 'es', 'zh'] as const) {
      const composed = buildShareMessage(makeState(), { language });
      assert.notEqual(composed.text, en.text);
    }
  });
});
