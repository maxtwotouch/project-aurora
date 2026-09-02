// Builds the Cloudflare Pages output for aurora.hovding.dev (owner-managed,
// builds from `main`; see docs/deploying.md's "Frontend: Cloudflare Pages"
// section for the exact dashboard settings this script assumes).
//
// Layout produced in dist-pages/ (gitignored, regenerated on every build):
//   dist-pages/index.html   <- public/landing.html (marketing landing, canonical)
//   dist-pages/privacy.html <- public/privacy.html
//   dist-pages/go.html      <- public/go.html       (legacy QR alias, redirects to /)
//   dist-pages/app/**       <- `expo export --platform web` output, asset
//                              paths rooted at /app (see app.config.js's
//                              EXPO_WEB_BASE_URL -> experiments.baseUrl)
//
// Why the landing page's SOURCE file is public/landing.html, not
// public/index.html: Expo's web export treats a file literally named
// `public/index.html`, if present, as a *template* it injects its own
// <link rel="icon">/<script> tags into (see
// @expo/cli's `createTemplateHtmlFromExpoConfigAsync` /
// `copyPublicFolderAsync`, used by `expo export --platform web`) -- it is
// NOT just another static file copied verbatim the way go.html/privacy.html
// are. A marketing landing page at that path would get the app's JS bundle
// spliced into a page with no `#root` mount node, silently breaking both
// the landing page and the web app export. Naming the source
// `public/landing.html` avoids that collision entirely (Expo has no special
// handling for that filename), and this script renames it to `index.html`
// only in the final dist-pages/ assembly step below, once Expo is done.
//
// This is the Cloudflare Pages build command (`npm run build:pages`); the
// output directory setting in the Cloudflare dashboard is `dist-pages`.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXPO_EXPORT_DIR = path.join(ROOT, 'dist'); // expo export's default output dir
const OUT_DIR = path.join(ROOT, 'dist-pages');
const OUT_APP_DIR = path.join(OUT_DIR, 'app');

const APP_BASE_URL = '/app';

function log(message) {
  console.log(`[build:pages] ${message}`);
}

function fail(message) {
  console.error(`[build:pages] ERROR: ${message}`);
  process.exit(1);
}

// 1. Clean start -- both the assembled output and any stale expo export, so
//    a previous run's leftovers can never silently leak into this one.
log(`cleaning ${path.relative(ROOT, OUT_DIR)} and ${path.relative(ROOT, EXPO_EXPORT_DIR)}`);
rmSync(OUT_DIR, { recursive: true, force: true });
rmSync(EXPO_EXPORT_DIR, { recursive: true, force: true });

// 2. Export the Expo web app with its base path rooted at /app, so the
//    exported index.html's asset/script URLs resolve correctly once served
//    from aurora.hovding.dev/app/ rather than the site root. See
//    app.config.js: EXPO_WEB_BASE_URL is threaded into
//    `experiments.baseUrl`, which `expo export --platform web` reads to
//    emit rooted asset paths.
log(`running "npx expo export --platform web" with EXPO_WEB_BASE_URL=${APP_BASE_URL}`);
try {
  execFileSync('npx', ['expo', 'export', '--platform', 'web'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, EXPO_WEB_BASE_URL: APP_BASE_URL }
  });
} catch (error) {
  fail(`expo export failed: ${error instanceof Error ? error.message : error}`);
}

if (!existsSync(EXPO_EXPORT_DIR)) {
  fail(`expo export did not produce ${path.relative(ROOT, EXPO_EXPORT_DIR)}`);
}

// 3. Verify the exported index.html actually resolves asset paths under
//    /app before we go any further -- catches a silent EXPO_WEB_BASE_URL
//    regression (e.g. an app.config.js change that stops threading the env
//    var through) at build time instead of after a deploy.
const exportedIndexPath = path.join(EXPO_EXPORT_DIR, 'index.html');
if (!existsSync(exportedIndexPath)) {
  fail(`expo export did not produce ${path.relative(ROOT, exportedIndexPath)}`);
}
const exportedIndexHtml = readFileSync(exportedIndexPath, 'utf8');
const assetRefs = [...exportedIndexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
const rootedAssetRefs = assetRefs.filter((ref) => ref.startsWith('/'));
if (rootedAssetRefs.length === 0) {
  fail('exported index.html has no root-relative asset references to check -- expo export output shape may have changed');
}
const badAssetRefs = rootedAssetRefs.filter((ref) => !ref.startsWith(`${APP_BASE_URL}/`));
if (badAssetRefs.length > 0) {
  fail(
    `exported index.html has asset references NOT rooted at ${APP_BASE_URL}: ${badAssetRefs.join(', ')} -- ` +
      'check EXPO_WEB_BASE_URL is set and app.config.js still threads it into experiments.baseUrl'
  );
}
log(`verified ${rootedAssetRefs.length} asset reference(s) in the exported index.html resolve under ${APP_BASE_URL}`);

// 4. Assemble dist-pages/: static landing pages at the root, the verified
//    Expo web export under /app.
mkdirSync(OUT_DIR, { recursive: true });

const STATIC_PAGES = [
  // [source filename in public/, destination filename in dist-pages/]
  ['landing.html', 'index.html'],
  ['privacy.html', 'privacy.html'],
  ['go.html', 'go.html']
];
for (const [fromName, toName] of STATIC_PAGES) {
  const from = path.join(PUBLIC_DIR, fromName);
  if (!existsSync(from)) {
    fail(`missing ${path.relative(ROOT, from)} -- expected a static landing page here`);
  }
  cpSync(from, path.join(OUT_DIR, toName));
}

cpSync(EXPO_EXPORT_DIR, OUT_APP_DIR, { recursive: true });

// Expo's `expo export` copies the *entire* public/ folder into its own
// output too (that's how go.html/privacy.html have always been reachable
// standalone, with no build step). That means the marketing pages above
// land a second time under dist-pages/app/ -- harmless (nothing links to
// them there), but confusing to find during a review, so drop the
// duplicates: the canonical copies already live at the dist-pages/ root.
for (const [, toName] of STATIC_PAGES) {
  rmSync(path.join(OUT_APP_DIR, toName === 'index.html' ? 'landing.html' : toName), { force: true });
}

// SPA fallback so a hard refresh on a client-side route under /app still
// resolves (same reasoning as .github/workflows/pages.yml's GitHub Pages
// SPA-fallback step).
cpSync(path.join(OUT_APP_DIR, 'index.html'), path.join(OUT_APP_DIR, '404.html'));

log('done. Summary:');
log(`  ${path.relative(ROOT, OUT_DIR)}/index.html    (marketing landing, canonical -- from public/landing.html)`);
log(`  ${path.relative(ROOT, OUT_DIR)}/privacy.html  (from public/privacy.html)`);
log(`  ${path.relative(ROOT, OUT_DIR)}/go.html        (legacy QR alias, redirects to / -- from public/go.html)`);
log(`  ${path.relative(ROOT, OUT_DIR)}/app/           (Expo web export, base path ${APP_BASE_URL})`);
log('Cloudflare Pages settings: build command "npm run build:pages", output directory "dist-pages" (see docs/deploying.md).');
