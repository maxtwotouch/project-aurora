// Local Expo config plugin: unblock iOS builds on Xcode 26+.
//
// React Native 0.79 (Expo SDK 53) vendors fmt 11.0.2 via RCT-Folly, which uses
// consteval-based FMT_STRING checks. Xcode 26's stricter Clang rejects these with
// "call to consteval function ... is not a constant expression".
//
// fmt gates consteval behind FMT_USE_CONSTEVAL, but its header defines that macro
// through an unconditional #if/#elif chain that a compiler -D flag does not
// override, so we rewrite the vendored header during `pod install`'s post_install
// hook (which runs after the pods are downloaded) to force FMT_USE_CONSTEVAL to 0.
// fmt then falls back to runtime format-string validation and compiles cleanly.
//
// Transitional workaround until the project moves to an SDK whose fmt is patched
// upstream (fmt >= 12, RN >= 0.83 / Expo SDK 56).
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'fmt-consteval-fix';

const SNIPPET = `
    # >>> ${MARKER}: force fmt to skip consteval so RN 0.79's bundled fmt compiles on Xcode 26+
    Dir.glob(File.join(installer.sandbox.root, '**', 'fmt', '{base,core,format}.h')).each do |fmt_header|
      fmt_contents = File.read(fmt_header)
      fmt_patched = fmt_contents.gsub(/define FMT_USE_CONSTEVAL 1/, 'define FMT_USE_CONSTEVAL 0')
      if fmt_patched != fmt_contents
        File.write(fmt_header, fmt_patched)
        Pod::UI.puts "[${MARKER}] Disabled consteval in #{fmt_header}"
      end
    end
    # <<< ${MARKER}
`;

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) {
        return config;
      }

      const postInstallOpener = /post_install do \|installer\|\n/;
      if (postInstallOpener.test(contents)) {
        contents = contents.replace(postInstallOpener, (match) => match + SNIPPET);
      } else {
        // Expo-generated Podfiles always include a post_install block, but fall
        // back to appending one so the fix degrades gracefully.
        contents += `\n  post_install do |installer|\n${SNIPPET}  end\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
