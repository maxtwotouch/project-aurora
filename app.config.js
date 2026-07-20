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
const appJson = require('./app.json');

// Aurora push alerts, iOS background/killed delivery (docs/design-aurora-alerts.md,
// backend/src/fcm.ts): registers the local config plugin that writes the iOS bundle's
// Localizable.strings entries the backend's APNs alert payload's ALERT_TITLE_<TIER> /
// ALERT_BODY_<TIER> loc-keys need. Added here (unconditionally, not gated on any
// alerts-specific file existing) rather than app.json's static `plugins` array so it
// stays a single source of truth alongside any future config-driven plugin additions --
// it is inert either way: it only ever writes static strings-table entries into the iOS
// project and never reads an alerts-specific env var or config file, so it changes
// nothing for Android or web, and costs nothing on iOS builds even before push alerts
// are wired up (owner's Firebase setup, docs/setup-firebase-alerts.md).
const ALERT_STRINGS_PLUGIN = './plugins/withAlertLocalizableStrings.js';

function withAlertStringsPlugin(expoConfig) {
  if (!expoConfig) return expoConfig;
  const existingPlugins = expoConfig.plugins || [];
  if (existingPlugins.includes(ALERT_STRINGS_PLUGIN)) {
    return expoConfig;
  }
  return { ...expoConfig, plugins: [...existingPlugins, ALERT_STRINGS_PLUGIN] };
}

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...(config || {}) };
  const baseUrl = process.env.EXPO_WEB_BASE_URL;

  if (!baseUrl) {
    return withAlertStringsPlugin(config);
  }

  return {
    ...appJson,
    expo: withAlertStringsPlugin({
      ...base,
      experiments: {
        ...(base.experiments || {}),
        baseUrl,
      },
    }),
  };
};
