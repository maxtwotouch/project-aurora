// Tests for the pure decision logic in src/notifications/alertsClient.ts
// (tier -> topic mapping, topic subscribe/unsubscribe planning, and
// localized notification text composition from a data-only push payload).
// No react-native / @react-native-firebase import anywhere in this file's
// dependency graph -- see alertsClient.ts's own header for why that split
// exists and how it mirrors src/analytics/core.ts's test coverage.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_TIERS,
  ALERT_TOPICS,
  DEFAULT_ENABLED_TIER,
  allTopics,
  composeAlertNotification,
  isAlertTier,
  parseAlertPushData,
  planTopicsForTier,
  tierForPushData,
  topicForTier
} from '../src/notifications/alertsClient.js';
import type { AlertPushData } from '../src/notifications/alertsClient.js';

describe('alertsClient: isAlertTier', () => {
  test('accepts "off", "ge45", "ge70"', () => {
    assert.equal(isAlertTier('off'), true);
    assert.equal(isAlertTier('ge45'), true);
    assert.equal(isAlertTier('ge70'), true);
  });

  test('rejects null, unrecognized strings, and non-strings', () => {
    assert.equal(isAlertTier(null), false);
    assert.equal(isAlertTier(undefined), false);
    assert.equal(isAlertTier('ge99'), false);
    assert.equal(isAlertTier(''), false);
    assert.equal(isAlertTier(70), false);
  });
});

describe('alertsClient: topic naming stays in lockstep with the backend', () => {
  // backend/src/alerts.ts's ALERT_TIERS defines exactly these two topic
  // names -- this test exists to catch an accidental client-side rename
  // that would silently desync from what the backend actually publishes to.
  test('topic names are byte-identical to backend/src/alerts.ts', () => {
    assert.equal(ALERT_TOPICS.ge45, 'alerts-ge45');
    assert.equal(ALERT_TOPICS.ge70, 'alerts-ge70');
  });

  test('ALERT_TIERS lists exactly the two non-off tiers', () => {
    assert.deepEqual([...ALERT_TIERS].sort(), ['ge45', 'ge70']);
  });

  test('DEFAULT_ENABLED_TIER is the higher bar ("Only great nights"), per docs/design-aurora-alerts.md section 1', () => {
    assert.equal(DEFAULT_ENABLED_TIER, 'ge70');
  });

  test('topicForTier maps off -> null and each tier -> its topic', () => {
    assert.equal(topicForTier('off'), null);
    assert.equal(topicForTier('ge45'), 'alerts-ge45');
    assert.equal(topicForTier('ge70'), 'alerts-ge70');
  });

  test('allTopics lists both known topics', () => {
    assert.deepEqual([...allTopics()].sort(), ['alerts-ge45', 'alerts-ge70']);
  });
});

describe('alertsClient: planTopicsForTier (subscribe/unsubscribe planning)', () => {
  test('off: unsubscribes from everything, subscribes to nothing', () => {
    const plan = planTopicsForTier('off');
    assert.deepEqual(plan.subscribe, []);
    assert.deepEqual([...plan.unsubscribe].sort(), ['alerts-ge45', 'alerts-ge70']);
  });

  test('ge45: subscribes to alerts-ge45, unsubscribes from alerts-ge70 only', () => {
    const plan = planTopicsForTier('ge45');
    assert.deepEqual(plan.subscribe, ['alerts-ge45']);
    assert.deepEqual(plan.unsubscribe, ['alerts-ge70']);
  });

  test('ge70: subscribes to alerts-ge70, unsubscribes from alerts-ge45 only', () => {
    const plan = planTopicsForTier('ge70');
    assert.deepEqual(plan.subscribe, ['alerts-ge70']);
    assert.deepEqual(plan.unsubscribe, ['alerts-ge45']);
  });

  test('is self-healing: unsubscribe is always computed from the target tier alone, never a stale "from"', () => {
    // Two different callers "changing to ge45" from different (possibly
    // stale/corrupt) starting points must produce the identical plan --
    // planTopicsForTier takes no `from` argument at all, which is the
    // property this test is really asserting.
    const planA = planTopicsForTier('ge45');
    const planB = planTopicsForTier('ge45');
    assert.deepEqual(planA, planB);
  });

  test('changing between the two enabled tiers never leaves both topics subscribed', () => {
    const toGe70 = planTopicsForTier('ge70');
    assert.equal(toGe70.subscribe.includes('alerts-ge70'), true);
    assert.equal(toGe70.unsubscribe.includes('alerts-ge45'), true);
  });
});

function makePushData(overrides: Partial<AlertPushData> = {}): Record<string, unknown> {
  return {
    threshold: '70',
    score: '82',
    spotId: 'ersfjordbotn',
    spotName: 'Ersfjordbotn',
    bestWindowStart: '2026-07-19T20:00:00.000Z',
    bestWindowEnd: '2026-07-19T23:00:00.000Z',
    ...overrides
  };
}

describe('alertsClient: parseAlertPushData', () => {
  test('parses a well-formed data-only payload', () => {
    const parsed = parseAlertPushData(makePushData());
    assert.deepEqual(parsed, {
      threshold: '70',
      score: '82',
      spotId: 'ersfjordbotn',
      spotName: 'Ersfjordbotn',
      bestWindowStart: '2026-07-19T20:00:00.000Z',
      bestWindowEnd: '2026-07-19T23:00:00.000Z'
    });
  });

  test('returns null for null/undefined input', () => {
    assert.equal(parseAlertPushData(null), null);
    assert.equal(parseAlertPushData(undefined), null);
  });

  test('returns null when any required field is missing', () => {
    const { spotName: _spotName, ...withoutSpotName } = makePushData();
    assert.equal(parseAlertPushData(withoutSpotName), null);
  });

  test('returns null when any required field is an empty string', () => {
    assert.equal(parseAlertPushData(makePushData({ score: '' })), null);
  });

  test('returns null when a field is present but not a string (e.g. a device-token-shaped object slipped in)', () => {
    assert.equal(
      parseAlertPushData({ ...makePushData(), spotId: { nested: 'not-a-string' } as unknown as string }),
      null
    );
  });

  test('never throws on a completely unrelated/malformed payload shape', () => {
    assert.doesNotThrow(() => parseAlertPushData({ foo: 'bar' }));
    assert.equal(parseAlertPushData({ foo: 'bar' }), null);
  });
});

describe('alertsClient: tierForPushData', () => {
  test('threshold "70" resolves to ge70', () => {
    assert.equal(tierForPushData(parseAlertPushData(makePushData({ threshold: '70' }))!), 'ge70');
  });

  test('threshold "45" resolves to ge45', () => {
    assert.equal(tierForPushData(parseAlertPushData(makePushData({ threshold: '45' }))!), 'ge45');
  });

  test('an unrecognized threshold value falls back to ge45 rather than throwing', () => {
    assert.equal(tierForPushData(parseAlertPushData(makePushData({ threshold: '999' }))!), 'ge45');
  });
});

describe('alertsClient: composeAlertNotification', () => {
  test('ge70 payload picks the "great chance" English title', () => {
    const parsed = parseAlertPushData(makePushData({ threshold: '70' }))!;
    const { title } = composeAlertNotification(parsed, 'en');
    assert.equal(title, 'Great aurora chance tonight');
  });

  test('ge45 payload picks the plain "chance" English title', () => {
    const parsed = parseAlertPushData(makePushData({ threshold: '45' }))!;
    const { title } = composeAlertNotification(parsed, 'en');
    assert.equal(title, 'Aurora chance tonight');
  });

  test('body interpolates spotName and score from the payload', () => {
    const parsed = parseAlertPushData(makePushData({ spotName: 'Ersfjordbotn', score: '82' }))!;
    const { body } = composeAlertNotification(parsed, 'en');
    assert.match(body, /Ersfjordbotn/);
    assert.match(body, /82\/100/);
  });

  test('body renders the best-window start/end as HH:MM (24h) times, not the raw ISO strings', () => {
    const parsed = parseAlertPushData(makePushData())!;
    const { body } = composeAlertNotification(parsed, 'en');
    assert.doesNotMatch(body, /2026-07-19T/);
    assert.match(body, /\d{2}:\d{2}.*\d{2}:\d{2}/);
  });

  test('renders in every supported language without throwing, each producing non-empty, distinct-from-English title/body text where the language differs', () => {
    const parsed = parseAlertPushData(makePushData())!;
    const en = composeAlertNotification(parsed, 'en');
    for (const language of ['de', 'fr', 'es', 'zh'] as const) {
      const composed = composeAlertNotification(parsed, language);
      assert.ok(composed.title.length > 0);
      assert.ok(composed.body.length > 0);
      assert.notEqual(composed.title, '');
      // Every non-English catalog should differ textually from English for
      // at least the title (guards against a copy-pasted-but-untranslated
      // entry slipping through unnoticed).
      assert.notEqual(composed.title, en.title);
    }
  });

  test('falls back to English for an unrecognized language code', () => {
    const parsed = parseAlertPushData(makePushData({ threshold: '70' }))!;
    // @ts-expect-error -- deliberately passing an unsupported code to prove the runtime fallback
    const composed = composeAlertNotification(parsed, 'xx');
    assert.equal(composed.title, 'Great aurora chance tonight');
  });

  test('an unparseable best-window date falls back to the raw string instead of "Invalid Date"', () => {
    const parsed = parseAlertPushData(makePushData({ bestWindowStart: 'not-a-date' }))!;
    const { body } = composeAlertNotification(parsed, 'en');
    assert.doesNotMatch(body, /Invalid Date/);
    assert.match(body, /not-a-date/);
  });
});
