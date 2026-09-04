import { useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

import { useConsent } from '../analytics/consent';
import { usePersonalAnalyticsConsent } from '../analytics/personalAnalyticsConsent';
import { useTourismConsent } from '../analytics/tourismConsent';
import { ConsentModal } from './ConsentModal';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the whole app (see App.tsx / App.web.tsx). Renders the main app
 * immediately regardless of consent state -- nothing here blocks data
 * loading or navigation -- and layers the first-open consent prompt(s) on
 * top only while a choice is genuinely 'unset'.
 *
 * THREE independent first-open questions are sequenced here, one at a time:
 *
 * 0. Tourism insights (useTourismConsent) -- NATIVE ONLY
 *    (`Platform.OS !== 'web'`). On web this step is skipped entirely and the
 *    store is left 'unset' forever, so nothing location-derived is ever
 *    collected on web (see src/analytics/tourismConsent.ts's header). Shown
 *    first, while `tourism.state === 'unset'`, and carries the language
 *    picker row (`showLanguageRow`) since it is the very first thing a
 *    native user answers. On accept, the location permission prompt is
 *    requested here (see the `handleTourismAccept` below) BEFORE the
 *    consent is recorded, with `busy` disabling both buttons for the
 *    duration -- consent to the PURPOSE is recorded regardless of what the
 *    OS permission dialog returns (declining the OS prompt does not revoke
 *    consent; the presence engine checks permission itself at run time, and
 *    Settings' TourismConsentToggle shows a "permission missing" helper
 *    when consent is on but the OS permission is off).
 * 1. Usage counters (useConsent) -- shown once step 0 has been answered (on
 *    native) or skipped (on web, where step 0 never applies).
 *    `showLanguageRow` is shown here only when step 0 did NOT apply (i.e.
 *    on web) -- otherwise the language was already confirmed at step 0.
 * 2. Person-level analytics (usePersonalAnalyticsConsent) -- shown once step
 *    1 has been answered, as today.
 *
 * "Answered" always means accepted OR declined -- either way counts as
 * answered for sequencing purposes. Each step is its own ConsentModal render
 * with its own copy and its own accept/decline callbacks, so accepting or
 * declining one never resolves, infers, or defaults another (see
 * src/analytics/core.ts's per-dimension doc comments for why unbundling this
 * way is required).
 *
 * WHY RE-ASKING STEP 0 WORKS FOR EVERYONE: tourism consent now lives under a
 * brand new storage key (`aurora.tourismConsent.v1`) that nobody has ever
 * had a persisted value for -- including people who previously accepted the
 * old, narrower "Trip-mode consent" ('aurora.tripModeConsent.v1', never read
 * again). A missing/unset stored value already means "not yet asked", so
 * every returning user sees this question exactly once, the same mechanism
 * that already re-prompts every user for the person-level analytics
 * question (step 2) without needing a separate "have we shown the new
 * question yet" flag.
 *
 * Once every applicable dimension has a real persisted choice (accepted or
 * declined), no prompt shows again; the Settings toggles
 * (TourismConsentToggle / UsageConsentToggle / PersonalAnalyticsToggle) are
 * the only way to revisit any choice afterwards.
 */
export function ConsentGate({ children }: Props) {
  const tourism = useTourismConsent();
  const usage = useConsent();
  const personalAnalytics = usePersonalAnalyticsConsent();
  const [tourismBusy, setTourismBusy] = useState(false);

  const tourismApplicable = Platform.OS !== 'web';
  const tourismAnswered = !tourismApplicable || tourism.state !== 'unset';

  const bothLoaded = usage.loaded && personalAnalytics.loaded && (!tourismApplicable || tourism.loaded);
  const showTourismStep = bothLoaded && tourismApplicable && tourism.state === 'unset';
  const showUsageStep = bothLoaded && tourismAnswered && usage.state === 'unset';
  const showPersonalAnalyticsStep = bothLoaded && tourismAnswered && usage.state !== 'unset' && personalAnalytics.state === 'unset';

  async function handleTourismAccept() {
    setTourismBusy(true);
    // Consent to the PURPOSE is recorded regardless of the OS permission
    // outcome -- see the module header. The presence engine checks
    // permission itself at run time (src/hooks/useTripPresence.ts), and
    // Settings shows a "permission missing" helper when needed.
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // Ignored -- see above: the permission result never blocks recording
      // the consent choice.
    }
    tourism.accept();
    setTourismBusy(false);
  }

  return (
    <>
      {children}
      {showTourismStep ? (
        <ConsentModal
          copyKeyPrefix="tourismConsent"
          showLanguageRow
          busy={tourismBusy}
          onAccept={() => void handleTourismAccept()}
          onDecline={tourism.decline}
        />
      ) : null}
      {showUsageStep ? (
        <ConsentModal showLanguageRow={!tourismApplicable} onAccept={usage.accept} onDecline={usage.decline} />
      ) : null}
      {showPersonalAnalyticsStep ? (
        <ConsentModal
          copyKeyPrefix="personalAnalyticsConsent"
          showLanguageRow={false}
          onAccept={personalAnalytics.accept}
          onDecline={personalAnalytics.decline}
        />
      ) : null}
    </>
  );
}
