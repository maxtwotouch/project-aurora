// Local Expo config plugin: bundles the iOS Localizable.strings entries the
// backend's APNs alert payload needs for native background/killed-app
// notification delivery.
//
// WHY THIS EXISTS (see docs/design-aurora-alerts.md and
// docs/privacy-push-alerts.md): backend/src/fcm.ts's data-only FCM messages
// do not wake a backgrounded/killed iOS app -- only a native APNs `alert`
// block does. That alert is addressed by `title-loc-key` / `loc-key` /
// `loc-args` (see backend/src/fcm.ts's buildApnsAlert), which tells iOS
// "render this notification using the ALERT_TITLE_<TIER> / ALERT_BODY_<TIER>
// strings table entries from the app bundle itself, substituting loc-args
// positionally, in whatever language this device is set to" -- entirely
// on-device, no extra network round trip, and correctly localized by the
// device's language rather than whatever language the backend happened to
// guess.
//
// This plugin is the other half of that contract: it writes those four keys
// (per tier: ALERT_TITLE_GE70/GE45, ALERT_BODY_GE70/GE45) into a
// Localizable.strings file for each of the five languages this app already
// ships (see src/i18n/locales/{en,de,fr,es,zh}.json), at `expo prebuild`
// time, following the exact pattern @expo/config-plugins' own
// ios/Locales.js (config.locales -> InfoPlist.strings) uses for iOS
// resource-bundling: write a per-language `<lang>.lproj/Localizable.strings`
// file under the Xcode project's Supporting/ directory, then register it in
// the pbxproj via IOSConfig.XcodeUtils.ensureGroupRecursively +
// addResourceFileToGroup so it's actually copied into the app bundle at
// build time (not just sitting on disk unreferenced).
//
// Wording: the ALERT_BODY_* templates below intentionally match the meaning
// (not the exact %-placeholder shape) of the `alerts.notification` strings
// PR #52 (origin/feat/alerts-client) added to src/i18n/locales/*.json for
// the client's own data-only-payload render path (see
// src/notifications/alertsClient.ts's composeAlertNotification there) --
// same five languages, same tone, but using Apple's `%@`/`%1$@` positional
// format-string syntax instead of i18next's `{{var}}`, and only the two
// args backend/src/fcm.ts's loc-args array actually sends (spotName, the
// Oslo-local best-window time range) since APNs' native alert path doesn't
// carry the numeric score the client's own richer client-side render does.
// This plugin and PR #52's client are independent, non-overlapping delivery
// paths for the SAME underlying alert (native APNs alert for
// background/killed iOS; PR #52's client-composed notification for
// foreground iOS and all of Android) -- see backend/src/fcm.ts's header
// comment for the full split.
//
// Registered unconditionally in app.config.js (not gated on Firebase config
// files existing, unlike the alerts client's own @react-native-firebase
// plugin additions): this plugin is inert either way -- it only ever writes
// static strings-table entries into the iOS project and does not read any
// alerts-specific env var, so it changes nothing for Android or web, and
// costs nothing on iOS builds even before push alerts are wired up.
const { withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STRINGS_FILE_NAME = 'Localizable.strings';

// Keep in sync with backend/src/alerts.ts's ALERT_TIERS (ge70/ge45) and
// backend/src/fcm.ts's ALERT_TITLE_<TIER> / ALERT_BODY_<TIER> loc-key
// naming (tier id upper-cased). %1$@ = loc-args[0] (spotName), %2$@ =
// loc-args[1] (the "HH:MM-HH:MM" Oslo-local best-window range) -- see
// backend/src/fcm.ts's buildApnsAlert for the array this must match
// positionally.
const ALERT_STRINGS = {
  en: {
    ALERT_TITLE_GE70: 'Great aurora chance tonight',
    ALERT_TITLE_GE45: 'Aurora chance tonight',
    ALERT_BODY_GE70: '%1$@ — best window %2$@',
    ALERT_BODY_GE45: '%1$@ — best window %2$@'
  },
  de: {
    ALERT_TITLE_GE70: 'Sehr gute Aurora-Chance heute Nacht',
    ALERT_TITLE_GE45: 'Aurora-Chance heute Nacht',
    ALERT_BODY_GE70: '%1$@ — bestes Zeitfenster %2$@',
    ALERT_BODY_GE45: '%1$@ — bestes Zeitfenster %2$@'
  },
  fr: {
    ALERT_TITLE_GE70: "Très bonne chance d'aurore ce soir",
    ALERT_TITLE_GE45: "Chance d'aurore ce soir",
    ALERT_BODY_GE70: '%1$@ — meilleure fenêtre %2$@',
    ALERT_BODY_GE45: '%1$@ — meilleure fenêtre %2$@'
  },
  es: {
    ALERT_TITLE_GE70: 'Muy buena posibilidad de aurora esta noche',
    ALERT_TITLE_GE45: 'Posibilidad de aurora esta noche',
    ALERT_BODY_GE70: '%1$@ — mejor ventana %2$@',
    ALERT_BODY_GE45: '%1$@ — mejor ventana %2$@'
  },
  zh: {
    ALERT_TITLE_GE70: '今晚极光机会极佳',
    ALERT_TITLE_GE45: '今晚有极光机会',
    ALERT_BODY_GE70: '%1$@ — 最佳时段 %2$@',
    ALERT_BODY_GE45: '%1$@ — 最佳时段 %2$@'
  }
};

// This app's `zh` i18n catalog (src/i18n/locales/zh.json) is Simplified
// Chinese; `zh-Hans` is the correct iOS/CFBundleLocalizations region code
// for that, distinct from `zh` alone (which iOS treats as an unqualified/
// legacy code) or `zh-Hant` (Traditional).
const LPROJ_FOR_LANG = { en: 'en', de: 'de', fr: 'fr', es: 'es', zh: 'zh-Hans' };

function escapeStringsValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderStringsFile(entries) {
  return (
    Object.entries(entries)
      .map(([key, value]) => `"${key}" = "${escapeStringsValue(value)}";`)
      .join('\n') + '\n'
  );
}

async function writeAlertLocalizableStrings(projectRoot, project) {
  const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
  const supportingDirectory = path.join(projectRoot, 'ios', projectName, 'Supporting');

  for (const [lang, entries] of Object.entries(ALERT_STRINGS)) {
    const lproj = LPROJ_FOR_LANG[lang];
    const dir = path.join(supportingDirectory, `${lproj}.lproj`);
    await fs.promises.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, STRINGS_FILE_NAME);
    await fs.promises.writeFile(filePath, renderStringsFile(entries), 'utf8');

    const groupName = `${projectName}/Supporting/${lproj}.lproj`;
    const group = IOSConfig.XcodeUtils.ensureGroupRecursively(project, groupName);

    // Idempotent across repeated prebuilds (mirrors ios/Locales.js's own
    // "only write the file if it doesn't already exist" check): without
    // this, re-running prebuild would keep appending duplicate
    // PBXBuildFile/PBXResourcesBuildPhase entries for the same path.
    if (!group?.children.some(({ comment }) => comment === STRINGS_FILE_NAME)) {
      project = IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: path.relative(supportingDirectory, filePath),
        groupName,
        project,
        isBuildFile: true,
        verbose: false
      });
    }
  }

  // Deliberately NOT calling project.addKnownRegion() for de/fr/es/zh-Hans
  // here: @expo/config-plugins' own ios/Locales.js (the exact same
  // per-language .lproj resource-bundling pattern, for `expo.locales` ->
  // InfoPlist.strings) doesn't either. `knownRegions` is Xcode
  // project/App-Store-metadata bookkeeping (which languages the app
  // *declares* it supports); it is not required for iOS's own bundle
  // resource resolution (and therefore the APNs alert loc-key substitution
  // this plugin exists for) to find and use a `<lang>.lproj/Localizable
  // .strings` file that's actually present and referenced in the build's
  // Resources phase, which every language written above already is. If the
  // owner wants these languages to show up in iOS's per-app language picker
  // too, that's a separate, purely cosmetic follow-up.
  return project;
}

module.exports = function withAlertLocalizableStrings(config) {
  return withXcodeProject(config, async (config) => {
    config.modResults = await writeAlertLocalizableStrings(config.modRequest.projectRoot, config.modResults);
    return config;
  });
};
