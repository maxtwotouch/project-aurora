// Tests for the pure on-device recommendation-attribution module in
// src/trip/recommendationAttribution.ts -- no `expo-location`, no analytics
// module, no react-native import anywhere in this file's dependency graph,
// same convention as presenceCore.test.ts. See that module's own header for
// the privacy contract (this is the ENTIRE attribution mechanism -- nothing
// server-side ever joins "shown" with "visited") and
// docs/analytics-pivot.md's amendment, item 2, for the product spec.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ATTRIBUTION_CONFIG,
  attributeVisit,
  recordRecommendationShown,
  resetAttribution
} from '../src/trip/recommendationAttribution.js';
import type { AttributionConfig, AttributionState } from '../src/trip/recommendationAttribution.js';

const SHOWN_AT = Date.UTC(2026, 7, 18, 20, 0, 0); // 2026-08-18T20:00:00Z

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

describe('recordRecommendationShown', () => {
  test('builds a fresh state with no spots yet attributed', () => {
    const state = recordRecommendationShown('rec-1', ['ersfjordbotn', 'grotfjord'], SHOWN_AT);
    assert.deepEqual(state, {
      recommendationId: 'rec-1',
      spotIds: ['ersfjordbotn', 'grotfjord'],
      shownAtMs: SHOWN_AT,
      attributedSpotIds: []
    });
  });

  test('copies the spotIds array rather than aliasing the caller\'s array', () => {
    const spotIds = ['ersfjordbotn'];
    const state = recordRecommendationShown('rec-1', spotIds, SHOWN_AT);
    spotIds.push('grotfjord');
    assert.deepEqual(state.spotIds, ['ersfjordbotn']);
  });
});

describe('attributeVisit: no recommendation tracked', () => {
  test('returns no intent when state is null', () => {
    const result = attributeVisit(null, 'ersfjordbotn', SHOWN_AT + 1000);
    assert.equal(result.intent, null);
    assert.equal(result.state, null);
  });
});

describe('attributeVisit: non-recommended spot', () => {
  test('a visit to a spot outside spotIds produces no intent', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn', 'grotfjord'], SHOWN_AT);
    const result = attributeVisit(shown, 'sommaroy', SHOWN_AT + hours(1));

    assert.equal(result.intent, null);
    // State is untouched -- attributedSpotIds must not gain an entry for a
    // spot that was never recommended.
    assert.deepEqual(result.state, shown);
  });
});

describe('attributeVisit: successful attribution', () => {
  test('a visit to a recommended spot within the window produces recommended_spot_visit', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn', 'grotfjord'], SHOWN_AT);
    const visitAt = SHOWN_AT + hours(2);
    const result = attributeVisit(shown, 'ersfjordbotn', visitAt);

    assert.deepEqual(result.intent, {
      type: 'recommended_spot_visit',
      spotId: 'ersfjordbotn',
      recommendationId: 'rec-1',
      timeBucket: new Date(visitAt).getUTCHours()
    });
    assert.deepEqual(result.state?.attributedSpotIds, ['ersfjordbotn']);
  });

  test('timeBucket reflects the visit instant, not the shown instant', () => {
    // Shown at 20:00 UTC, visited at 23:00 UTC -- timeBucket must be 23.
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn'], SHOWN_AT);
    const visitAt = Date.UTC(2026, 7, 18, 23, 0, 0);
    const result = attributeVisit(shown, 'ersfjordbotn', visitAt);
    assert.equal(result.intent?.timeBucket, 23);
  });
});

describe('attributeVisit: dedupe -- one attribution per shown recommendation per spot', () => {
  test('a second visit to the same spot for the same shown recommendation produces no further intent', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn', 'grotfjord'], SHOWN_AT);
    const first = attributeVisit(shown, 'ersfjordbotn', SHOWN_AT + hours(1));
    assert.notEqual(first.intent, null);

    const second = attributeVisit(first.state, 'ersfjordbotn', SHOWN_AT + hours(3));
    assert.equal(second.intent, null);
    // Still only one entry in attributedSpotIds -- no duplicate bookkeeping.
    assert.deepEqual(second.state?.attributedSpotIds, ['ersfjordbotn']);
  });

  test('a different recommended spot remains independently attributable after another one already fired', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn', 'grotfjord'], SHOWN_AT);
    const first = attributeVisit(shown, 'ersfjordbotn', SHOWN_AT + hours(1));
    const second = attributeVisit(first.state, 'grotfjord', SHOWN_AT + hours(2));

    assert.deepEqual(second.intent, {
      type: 'recommended_spot_visit',
      spotId: 'grotfjord',
      recommendationId: 'rec-1',
      timeBucket: new Date(SHOWN_AT + hours(2)).getUTCHours()
    });
    assert.deepEqual(second.state?.attributedSpotIds.sort(), ['ersfjordbotn', 'grotfjord']);
  });
});

describe('attributeVisit: window edge (default 12h)', () => {
  test('a visit 11h59m after showing is still attributable', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn'], SHOWN_AT);
    const visitAt = SHOWN_AT + hours(12) - 60_000;
    const result = attributeVisit(shown, 'ersfjordbotn', visitAt);
    assert.notEqual(result.intent, null);
  });

  test('a visit exactly 12h after showing is still attributable (inclusive boundary)', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn'], SHOWN_AT);
    const visitAt = SHOWN_AT + hours(12);
    const result = attributeVisit(shown, 'ersfjordbotn', visitAt);
    assert.notEqual(result.intent, null);
  });

  test('a visit 12h01m after showing is NOT attributable', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn'], SHOWN_AT);
    const visitAt = SHOWN_AT + hours(12) + 60_000;
    const result = attributeVisit(shown, 'ersfjordbotn', visitAt);
    assert.equal(result.intent, null);
    // State is untouched on a non-attributable visit.
    assert.deepEqual(result.state, shown);
  });

  test('a visit timestamped before the recommendation was shown is NOT attributable', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn'], SHOWN_AT);
    const result = attributeVisit(shown, 'ersfjordbotn', SHOWN_AT - 1000);
    assert.equal(result.intent, null);
  });

  test('a custom, shorter attribution window is honored', () => {
    const shown = recordRecommendationShown('rec-1', ['ersfjordbotn'], SHOWN_AT);
    const config: AttributionConfig = { attributionWindowMs: hours(1) };
    const withinWindow = attributeVisit(shown, 'ersfjordbotn', SHOWN_AT + hours(1) - 1, config);
    const outsideWindow = attributeVisit(shown, 'ersfjordbotn', SHOWN_AT + hours(1) + 1, config);

    assert.notEqual(withinWindow.intent, null);
    assert.equal(outsideWindow.intent, null);
  });

  test('DEFAULT_ATTRIBUTION_CONFIG is 12 hours', () => {
    assert.equal(DEFAULT_ATTRIBUTION_CONFIG.attributionWindowMs, hours(12));
  });
});

describe('resetAttribution', () => {
  test('always returns null, the ephemeral initial state', () => {
    const midState: AttributionState = {
      recommendationId: 'rec-1',
      spotIds: ['ersfjordbotn'],
      shownAtMs: SHOWN_AT,
      attributedSpotIds: ['ersfjordbotn']
    };
    assert.equal(resetAttribution(), null);
    void midState;
  });
});
