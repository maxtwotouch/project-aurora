import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { AlertTier } from './alertsClient';
import {
  ensureForegroundAlertsHandlerRegistered,
  getAlertsState,
  loadAlertsState,
  setAlertsTier,
  subscribeAlertsState
} from './alertsService';
import type { AlertsPermissionOutcome, AlertsState } from './alertsService';

/**
 * Settings-screen hook for aurora alerts -- same
 * load/subscribe/get/set-with-persistence shape as
 * src/analytics/consent.ts's useConsent() and src/preview/previewMode.ts's
 * usePreviewMode(). See AuroraAlertsSection.tsx for the only current
 * consumer.
 */
export type UseAlertsResult = AlertsState & {
  /** True on web (see ./firebaseSeam.web.ts) -- alerts are native-only for
   * this PR; the UI should show a fixed "not available on web" message
   * instead of the disabled-until-a-future-build one `available: false`
   * implies on native. */
  isWebUnsupported: boolean;
  setTier: (tier: AlertTier) => Promise<AlertsPermissionOutcome>;
};

export function useAlerts(): UseAlertsResult {
  const [state, setState] = useState<AlertsState>(getAlertsState());

  useEffect(() => {
    let cancelled = false;

    void loadAlertsState().then((loaded) => {
      if (!cancelled) setState(loaded);
    });

    // Registering the foreground listener from here (rather than only at
    // app startup) is deliberate: it means a device only ever registers a
    // foreground listener once this screen has been visited, but since
    // ensureForegroundAlertsHandlerRegistered() is idempotent and this is
    // the only screen that can turn alerts on in the first place, that's
    // equivalent in practice to "registered once alerts could possibly be
    // relevant" without adding an always-on listener for users who never
    // touch the feature.
    void ensureForegroundAlertsHandlerRegistered();

    const unsubscribe = subscribeAlertsState((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    ...state,
    isWebUnsupported: Platform.OS === 'web',
    setTier: (tier: AlertTier) => setAlertsTier(tier)
  };
}
