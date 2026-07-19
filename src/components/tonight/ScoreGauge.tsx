import { ArcGauge } from '../../../design-system/components/ArcGauge';

type Props = {
  /** 0-100. Values outside that range are clamped. */
  score: number;
  /** Diameter in px. Defaults to a size that reads well inside the hero card. */
  size?: number;
  /** Small caption under the numeral, e.g. "SCORE". Optional -- omit to just show the number. */
  label?: string;
  accessibilityLabel: string;
};

/**
 * Aurora score gauge -- the app's own 0-100 wrapper over the design
 * system's `ArcGauge` (`design-system/components/ArcGauge.tsx`). Same
 * props, same behavior, same accessibility contract as the app's original
 * standalone gauge (nothing here changes what any caller sees): `score` is
 * just `ArcGauge`'s `value` with `max` pinned to 100, and every color prop
 * is left at `ArcGauge`'s own default (`palette.auroraGreen` fill,
 * `palette.cardElevated` track, etc. -- see design-system/tokens.ts),
 * which are the same values this component hardcoded before the move.
 *
 * Kept as its own file/name (rather than having callers reach for
 * `ArcGauge` directly) so `HeroSection.tsx` and any future aurora-specific
 * screen have one obvious, score-flavored import -- and so this is the one
 * place aurora-specific gauge defaults (should they ever diverge from the
 * design system's generic ones) would live.
 */
export function ScoreGauge({ score, size, label, accessibilityLabel }: Props) {
  return <ArcGauge value={score} max={100} size={size} label={label} accessibilityLabel={accessibilityLabel} />;
}
