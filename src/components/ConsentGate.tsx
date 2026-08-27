import type { ReactNode } from 'react';

import { useConsent } from '../analytics/consent';
import { usePersonalAnalyticsConsent } from '../analytics/personalAnalyticsConsent';
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
 * Two INDEPENDENT first-open questions are sequenced here (see
 * docs/analytics-pivot.md sections 2 and 4, PR 2 of the analytics pivot):
 *
 * 1. The original aggregate usage-counter question (useConsent). Shown
 *    first, exactly as before.
 * 2. The person-level analytics question (usePersonalAnalyticsConsent).
 *    Shown once step 1 has been answered (accepted OR declined -- either
 *    way counts as "answered" for sequencing purposes) and only while this
 *    dimension is still 'unset'.
 *
 * The two are never combined into one screen/one accept-decline pair --
 * each is its own ConsentModal render with its own copy and its own
 * accept/decline callbacks, so accepting or declining one never resolves,
 * infers, or defaults the other (see core.ts's PersonalAnalyticsConsentState
 * doc comment for why unbundling this way is required).
 *
 * Because the person-level dimension is entirely new and defaults to
 * 'unset' for every install -- including people who already answered the
 * usage-counter question in a previous version of the app -- this same
 * logic automatically re-prompts every returning user for the new scope
 * the next time they open the app, without needing to track "has this
 * install already seen the pivot" separately: there is nothing to persist
 * for that, the missing/unset stored value already means "not yet asked".
 *
 * Once both dimensions have a real persisted choice (accepted or declined),
 * neither prompt shows again; the toggles in Settings
 * (UsageConsentToggle / PersonalAnalyticsToggle) are the only way to revisit
 * either choice afterwards.
 */
export function ConsentGate({ children }: Props) {
  const usage = useConsent();
  const personalAnalytics = usePersonalAnalyticsConsent();

  const bothLoaded = usage.loaded && personalAnalytics.loaded;
  const showUsageStep = bothLoaded && usage.state === 'unset';
  const showPersonalAnalyticsStep = bothLoaded && usage.state !== 'unset' && personalAnalytics.state === 'unset';

  return (
    <>
      {children}
      {showUsageStep ? <ConsentModal onAccept={usage.accept} onDecline={usage.decline} /> : null}
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
