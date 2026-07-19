/**
 * Web stub for ./firebaseSeam.ts.
 *
 * Aurora push alerts are native-only (topic-based FCM via
 * `@react-native-firebase`) -- see docs/design-aurora-alerts.md and this
 * feature's task brief: "web out of scope". Metro's RN platform-extension
 * resolution picks THIS file instead of firebaseSeam.ts for any
 * `--platform web` build/export whenever a caller writes an unsuffixed
 * `import ... from './firebaseSeam'` (the same pattern App.tsx / App.web.tsx
 * already rely on for the app root -- see App.tsx's header comment). That
 * means the `@react-native-firebase/{app,messaging}` packages are never
 * even *referenced* in the web module graph, let alone bundled -- stronger
 * than "imported but conditionally unused".
 *
 * Every export below mirrors firebaseSeam.ts's signatures exactly, always
 * resolving to "unavailable" / a no-op, so alertsService.ts never needs a
 * platform branch of its own.
 */

export async function isAlertsAvailable(): Promise<boolean> {
  return false;
}

export function resetAlertsAvailabilityCacheForTests(): void {
  // Nothing cached on web -- always unavailable.
}

export async function subscribeToAlertsTopic(_topic: string): Promise<boolean> {
  return false;
}

export async function unsubscribeFromAlertsTopic(_topic: string): Promise<boolean> {
  return false;
}

export type AlertsMessageListener = (data: Record<string, string | undefined>) => void;

export async function onAlertsMessage(_listener: AlertsMessageListener): Promise<(() => void) | null> {
  return null;
}

export async function registerAlertsBackgroundHandler(_listener: AlertsMessageListener): Promise<void> {
  // No-op on web.
}
