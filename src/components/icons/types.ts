/**
 * Shared prop shape for the hand-drawn "Fjord Line" tab icons in this
 * folder. Mirrors what React Navigation's bottom-tabs `tabBarIcon` render
 * prop already hands us (`color`/`size`/`focused`), so each icon drops in
 * as a direct replacement for the Ionicons glyph it used to render.
 */
export type LineIconProps = {
  /** Diameter in px -- the icon's own viewBox is square and scales to fill it. */
  size: number;
  /** Stroke (and any small fill accents') color -- already resolved by the
   *  navigator to auroraGreen (active) or textMuted/textSecondary (inactive). */
  color: string;
  /** Whether this is the active tab. Purely cosmetic here (a small extra
   *  filled accent on some marks) -- the active/inactive color swap above
   *  already carries the primary state signal, plus the pill background
   *  behind the icon in App.tsx/App.web.tsx. */
  focused?: boolean;
};

/** Consistent hand-drawn stroke weight across the whole icon set. */
export const LINE_ICON_STROKE_WIDTH = 1.7;
