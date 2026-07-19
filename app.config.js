// Extends app.json so local dev, native builds (EAS), and existing tooling
// that reads app.json keep working unchanged. The only behavior this adds:
// when EXPO_WEB_BASE_URL is set in the environment, it's threaded into
// `experiments.baseUrl` so `expo export --platform web` emits asset/route
// paths rooted at that base path (needed for GitHub Pages, which serves the
// site from /project-aurora/ rather than /). When the env var is unset
// (local dev, native builds, or any export that doesn't set it), we return
// `config` completely untouched -- that's Expo's already-fully-resolved
// config (app.json merged with any EAS profile overrides/plugin
// injections), so returning anything else here would silently drop those.
const fs = require('fs');
const path = require('path');
const appJson = require('./app.json');

// --- Aurora push alerts (PR beta, docs/design-aurora-alerts.md) ---------
//
// google-services.json (Android) / GoogleService-Info.plist (iOS) are
// owner-held secrets that download from the Firebase console -- see
// docs/setup-firebase-alerts.md section 5. They are NOT committed and do
// NOT exist in this repo as of this PR. HARD REQUIREMENT: every build (EAS,
// `expo export`, local dev) must behave EXACTLY as it did before this PR
// until the owner drops those two files in at the repo root -- so the
// @react-native-firebase/app + @react-native-firebase/messaging config
// plugins, and the `googleServicesFile` fields they read, are only added
// below when the corresponding file is actually present on disk
// (fs.existsSync). Until then this whole block is a no-op. The JS side of
// this same "stay inert without config" contract lives in
// src/notifications/ (a dynamic-import seam, never a hard `require` of the
// firebase packages -- see that folder's README-style header comment).
const GOOGLE_SERVICES_ANDROID_PATH = path.join(__dirname, 'google-services.json');
const GOOGLE_SERVICES_IOS_PATH = path.join(__dirname, 'GoogleService-Info.plist');
const hasAndroidGoogleServices = fs.existsSync(GOOGLE_SERVICES_ANDROID_PATH);
const hasIosGoogleServices = fs.existsSync(GOOGLE_SERVICES_IOS_PATH);
const hasAnyGoogleServices = hasAndroidGoogleServices || hasIosGoogleServices;

const FIREBASE_PLUGINS = ['@react-native-firebase/app', '@react-native-firebase/messaging'];

/**
 * Adds the Firebase config plugins + per-platform googleServicesFile
 * pointers to an already-resolved expo config object, but only for
 * platforms whose config file actually exists on disk. Returns `expoConfig`
 * completely untouched when neither file is present, so builds are
 * byte-for-byte unaffected before the owner's Firebase setup.
 */
function withFirebaseIfConfigured(expoConfig) {
  if (!hasAnyGoogleServices) {
    return expoConfig;
  }

  const existingPlugins = expoConfig.plugins || [];
  const plugins = [...existingPlugins, ...FIREBASE_PLUGINS.filter((name) => !existingPlugins.includes(name))];

  return {
    ...expoConfig,
    ios: {
      ...(expoConfig.ios || {}),
      ...(hasIosGoogleServices ? { googleServicesFile: './GoogleService-Info.plist' } : {})
    },
    android: {
      ...(expoConfig.android || {}),
      ...(hasAndroidGoogleServices ? { googleServicesFile: './google-services.json' } : {})
    },
    plugins
  };
}

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...(config || {}) };
  const baseUrl = process.env.EXPO_WEB_BASE_URL;

  if (!baseUrl) {
    return withFirebaseIfConfigured(config);
  }

  return {
    ...appJson,
    expo: withFirebaseIfConfigured({
      ...base,
      experiments: {
        ...(base.experiments || {}),
        baseUrl,
      },
    }),
  };
};
