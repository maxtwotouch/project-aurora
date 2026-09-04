// FIRST import, on purpose: patches Hermes's UTF-8-only TextDecoder so that
// h3-js (pulled in transitively via App -> useTripPresence -> src/trip/*)
// can evaluate without throwing `RangeError: Unknown encoding: utf-16le`.
// See src/lib/textDecoderShim.ts. Keep this above every other import.
import './src/lib/textDecoderShim';

import { registerRootComponent } from 'expo';

import App from './App';
import { registerBackgroundAlertsHandler } from './src/notifications/alertsService';

// Must run at module scope, before registerRootComponent, per
// @react-native-firebase/messaging's own contract for
// setBackgroundMessageHandler (see src/notifications/firebaseSeam.ts /
// alertsService.ts) -- registering it later, or inside a component, means
// Android can miss messages that arrive while the app is backgrounded or
// killed. No-ops safely on web and on any binary where Firebase isn't
// available yet (see alertsService.ts's header for the honest iOS
// background-delivery limitation this does NOT solve on its own).
registerBackgroundAlertsHandler();

registerRootComponent(App);
