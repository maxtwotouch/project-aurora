/**
 * Pure, framework-free "send tonight to a friend" share-message builder.
 * Deliberately has NO react-native / react-i18next import -- mirrors the
 * split src/notifications/alertsClient.ts already establishes for push
 * notification text (see that file's header): reads the five shipped
 * locale catalogs directly rather than the live i18next singleton, so this
 * can be unit-tested under plain Node (see test/shareMessage.test.ts) and
 * called from ShareButton.tsx without pulling react-i18next's runtime state
 * into the message itself (the button label/toast text still goes through
 * the normal useTranslation() hook -- only the *shared* text, which needs
 * to be fully formed before handing off to the OS Share sheet, lives here).
 *
 * Reuses two already-shipped catalog keys rather than duplicating their
 * per-locale phrasing:
 *   - `tonight.windowRange` for the "{{start}} to {{end}}" connector (each
 *     locale already phrases this correctly -- "bis...Uhr", "à", "至", etc.).
 *   - `tonight.polarDay.unknownDate` as the seasonReturns fallback, same as
 *     PolarDayNotice.tsx.
 */
import type { SupportedLanguage } from '../i18n/languages';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';
import fr from '../i18n/locales/fr.json';
import es from '../i18n/locales/es.json';
import zh from '../i18n/locales/zh.json';

const CATALOGS: Record<SupportedLanguage, typeof en> = { en, de, fr, es, zh };

// Real landing page (src/constants/legal.ts's PRIVACY_POLICY_URL uses the
// same host) -- see docs/marketing-channels.md for the `?src=<channel>`
// convention this reuses. `share` is a new channel slug for this feature
// (added to that doc's table in this same change).
const LANDING_URL = 'https://aurora.hovding.dev/go.html';
const DEFAULT_SHARE_CHANNEL = 'share';

/** Mirrors alertsClient.ts's own `interpolate` -- same non-throwing,
 * leave-the-token-in-place behavior on a missing var. Kept as an
 * independent copy rather than a shared import: alertsClient.ts lives under
 * the CODEOWNERS-protected src/notifications/ path (see .github/CODEOWNERS)
 * and is out of scope to modify (e.g. to export this helper) for this
 * change. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

/** Device-local "HH:MM" (24h) formatting -- same options as
 * alertsClient.ts's formatWindowTime / BestWindowSection's formatLocalTime.
 * Falls back to the raw ISO string on an unparseable date rather than
 * throwing or showing "Invalid Date". */
function formatWindowTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' });
}

/** Same day/month formatting PolarDayNotice.tsx uses for
 * darkness.seasonReturns, anchored to local noon so no timezone can shift
 * the calendar date a day either way. */
function formatSeasonReturnsDate(isoDate: string, language: SupportedLanguage): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(language, { month: 'long', day: 'numeric' });
}

function chanceKeyFromScore(score: number): 'chanceGreat' | 'chancePossible' | 'chanceLow' {
  if (score >= 70) return 'chanceGreat';
  if (score >= 45) return 'chancePossible';
  return 'chanceLow';
}

/** Tonight's state, as far as the share message needs to know it -- a
 * deliberately app-type-free shape (rather than importing SpotScoreResult /
 * GeneralForecastScore / DarknessSeasonState from ../types) so this module
 * has zero dependency on the rest of the app's data model and stays trivial
 * to unit-test with plain literals. Callers (ShareButton.tsx) narrow their
 * richer types down to this at the call site. */
export type ShareTonightState = {
  seasonClosed: boolean;
  /** ISO YYYY-MM-DD, or null when unknown/not seasonClosed. */
  seasonReturns: string | null;
  bestSpotName: string | null;
  score: number | null;
  bestWindowStart: string | null;
  bestWindowEnd: string | null;
};

export type BuildShareMessageOptions = {
  language: SupportedLanguage;
  /** `?src=` channel slug (see docs/marketing-channels.md). Defaults to
   * `'share'`, the slug for this in-app share action. */
  channel?: string;
};

export type ShareMessage = {
  /** Full message, ready to hand to `Share.share({ message })` /
   * `navigator.share({ text })` -- headline + best-spot line + link, each on
   * its own line. */
  text: string;
  /** The landing-page link alone (also embedded in `text`), in case a caller
   * wants it separately (e.g. `navigator.share({ url })` on web). */
  url: string;
};

/** Builds the tagged landing-page URL for a given channel slug, following
 * docs/marketing-channels.md's `?src=<channel>` convention. Exported so
 * ShareButton's web fallback (`navigator.share` without `text` support, or
 * copy-to-clipboard) can reuse the exact same URL if only a link is needed. */
export function buildShareUrl(channel: string = DEFAULT_SHARE_CHANNEL): string {
  return `${LANDING_URL}?src=${encodeURIComponent(channel)}`;
}

/**
 * Builds a short (2 lines + link), localized, non-spammy "send tonight to a
 * friend" message. Degrades gracefully:
 *   - `state.seasonClosed`: a "season starts around {{date}}" flavored
 *     message instead of a score (there is nothing to recommend tonight).
 *   - missing snapshot (no best spot / score / window yet, e.g. forecast
 *     still loading or every source failed): a generic invite message with
 *     just the link, never a broken/half-filled template.
 */
export function buildShareMessage(state: ShareTonightState, options: BuildShareMessageOptions): ShareMessage {
  const catalog = CATALOGS[options.language] ?? CATALOGS.en;
  const share = catalog.share.message;
  const url = buildShareUrl(options.channel);

  if (state.seasonClosed) {
    const dateLabel = state.seasonReturns
      ? formatSeasonReturnsDate(state.seasonReturns, options.language)
      : catalog.tonight.polarDay.unknownDate;
    const line1 = share.seasonClosedLine1;
    const line2 = interpolate(share.seasonClosedLine2, { date: dateLabel });
    return { text: `${line1}\n${line2}\n${url}`, url };
  }

  const hasTonightData =
    typeof state.score === 'number' &&
    Boolean(state.bestSpotName) &&
    Boolean(state.bestWindowStart) &&
    Boolean(state.bestWindowEnd);

  if (!hasTonightData) {
    return { text: `${share.genericLine1}\n${share.genericLine2}\n${url}`, url };
  }

  const line1 = share[chanceKeyFromScore(state.score as number)];
  const windowLabel = interpolate(catalog.tonight.windowRange, {
    start: formatWindowTime(state.bestWindowStart as string),
    end: formatWindowTime(state.bestWindowEnd as string)
  });
  const line2 = interpolate(share.bestSpotLine, { spot: state.bestSpotName as string, window: windowLabel });

  return { text: `${line1}\n${line2}\n${url}`, url };
}
