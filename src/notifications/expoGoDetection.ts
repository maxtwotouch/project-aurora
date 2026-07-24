/**
 * Pure Expo Go detection, split out of firebaseSeam.ts so it is unit-testable
 * without any native module involved (no `expo-constants` runtime, no
 * `@react-native-firebase/*`).
 *
 * WHY THIS EXISTS: Expo Go ships a fixed prebuilt binary that can never
 * contain the `@react-native-firebase/{app,messaging}` native modules --
 * there is no way for a JS-only app running inside Expo Go to link native
 * code in. Attempting `import('@react-native-firebase/app')` there still
 * evaluates that package's own native-module-resolution code, which logs a
 * `console.error` ("Native module RNFBAppModule not found") BEFORE
 * firebaseSeam.ts's `app.getApp()` availability probe ever gets a chance to
 * throw and be caught. That console noise is unavoidable once the dynamic
 * import happens, so the only fix is to never attempt the import at all when
 * running inside Expo Go -- see firebaseSeam.ts's `loadModules()`, which
 * calls `isExpoGoEnvironment` as its very first check.
 */

export type ExpoGoProbe = {
  executionEnvironment?: string | null;
  appOwnership?: string | null;
};

/**
 * Returns true when the given probe values (normally read off
 * `expo-constants`'s `Constants.executionEnvironment` /
 * `Constants.appOwnership`) indicate the app is running inside Expo Go.
 *
 * - `executionEnvironment === 'storeClient'` is the current (SDK 46+) signal.
 * - `appOwnership === 'expo'` is the older, now-deprecated signal, checked
 *   defensively since it is still set by Expo Go today.
 *
 * Anything else -- undefined/null, `'standalone'`, `'bare'`, or any other
 * value -- is treated as NOT Expo Go (a dev build or a standalone/EAS build,
 * where the native modules may genuinely be linked).
 */
export function isExpoGoEnvironment(probe: ExpoGoProbe): boolean {
  return probe.executionEnvironment === 'storeClient' || probe.appOwnership === 'expo';
}
