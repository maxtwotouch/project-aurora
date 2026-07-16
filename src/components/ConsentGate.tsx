import type { ReactNode } from 'react';

import { useConsent } from '../analytics/consent';
import { ConsentModal } from './ConsentModal';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the whole app (see App.tsx / App.web.tsx). Renders the main app
 * immediately regardless of consent state -- nothing here blocks data
 * loading or navigation -- and layers the first-open consent prompt on top
 * only while the choice is genuinely 'unset'. Once the persisted state has
 * loaded and a choice exists (accepted or declined), the prompt never
 * shows again; the toggle in AllSpotsScreen is the only way to revisit it.
 */
export function ConsentGate({ children }: Props) {
  const { state, loaded, accept, decline } = useConsent();

  return (
    <>
      {children}
      {loaded && state === 'unset' ? <ConsentModal onAccept={accept} onDecline={decline} /> : null}
    </>
  );
}
