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

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...(config || {}) };
  const baseUrl = process.env.EXPO_WEB_BASE_URL;

  if (!baseUrl) {
    return config;
  }

  return {
    ...appJson,
    expo: {
      ...base,
      experiments: {
        ...(base.experiments || {}),
        baseUrl,
      },
    },
  };
};
