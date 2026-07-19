import { useRef, useState } from 'react';
import { Animated, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ScoreBadge } from './ScoreBadge';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { motion, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
import type { SpotImageCredit } from '../data/spotExtras';

const AnimatedImage = Animated.createAnimatedComponent(Image);

type Props = {
  image: SpotImageCredit;
  name: string;
  /** Score at the spot's best hour, if the forecast has settled yet. */
  score: number | undefined;
  /** Fires once, the first time this image fails to load -- the caller
   *  drops back to the plain (non-photo) header entirely. */
  onError: () => void;
};

/**
 * Editorial hero for spot detail: a full-bleed photo with a bottom scrim
 * fading into the card's own ground color (`palette.nightPanel`) and the
 * spot name + score legible on top of it. Fixed 16:10 aspect so the layout
 * never jumps while the (remote, unverified-latency) image loads -- render
 * never blocks on the network fetch, only `onError` unwinds back to the
 * caller's plain layout. No parallax/scroll-linked motion: only a simple
 * opacity fade-in on load, skipped entirely under reduced motion.
 */
export function SpotHeroImage({ image, name, score, onError }: Props) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const [loaded, setLoaded] = useState(false);
  const creditLabel = t('spotDetail.photoCredit', { author: image.author, license: image.license });

  const handleLoad = () => {
    setLoaded(true);
    if (reducedMotion) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.slow,
      easing: motion.easing.out,
      useNativeDriver: true
    }).start();
  };

  return (
    <View style={styles.wrap}>
      <AnimatedImage
        source={{ uri: image.url }}
        style={[styles.image, { opacity }]}
        resizeMode="cover"
        onLoad={handleLoad}
        onError={onError}
        accessibilityIgnoresInvertColors
        accessibilityRole="image"
        accessibilityLabel={t('spotDetail.heroImageA11y', { name, author: image.author, license: image.license })}
      />
      {/* A neutral placeholder wash under the (possibly still-loading, or
          on web, decoding) image so the fixed-aspect box never shows raw
          transparency before the fade-in above completes. */}
      {!loaded ? <View style={styles.placeholder} pointerEvents="none" /> : null}

      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="heroScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.nightPanel} stopOpacity={0} />
            <Stop offset="0.5" stopColor={palette.nightPanel} stopOpacity={0.35} />
            <Stop offset="1" stopColor={palette.nightPanel} stopOpacity={0.98} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#heroScrim)" />
      </Svg>

      {/* box-none (not none): the credit line below is a real tap target
          (opens the Commons source page), everything else here stays
          purely decorative/pass-through. */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.overlayTopRow} pointerEvents="none">
          <Text style={styles.overlayTitle} numberOfLines={2}>
            {name}
          </Text>
          {typeof score === 'number' ? <ScoreBadge score={score} size="lg" /> : null}
        </View>

        {/* Attribution required by the photo's CC BY-SA license -- present
            whenever the image itself renders (loading or loaded; hidden
            entirely once onError swaps the caller back to the plain
            header, since there's then no photo to credit). */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={creditLabel}
          onPress={() => {
            void Linking.openURL(image.sourceUrl);
          }}
          style={({ pressed, focused }: WebPressableState) => [styles.creditRow, focused ? styles.creditFocusRing : null, pressed ? styles.creditPressed : null]}
        >
          <Text style={styles.creditText} numberOfLines={1}>
            {creditLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    position: 'relative',
    backgroundColor: palette.surfaceOverlay
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.surfaceOverlay
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    paddingTop: space.sm,
    gap: space.xxs
  },
  overlayTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.sm
  },
  overlayTitle: {
    ...typography.title,
    flex: 1,
    color: palette.textPrimary,
    textShadowColor: 'rgba(2, 10, 9, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6
  },
  // Credit sits on the scrim's bottom edge -- unobtrusive (caption size,
  // muted color) but always present while the photo is, per the license's
  // attribution requirement.
  creditRow: {
    alignSelf: 'flex-start',
    paddingVertical: 2
  },
  creditPressed: {
    opacity: 0.7
  },
  creditFocusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  creditText: {
    ...typography.caption,
    color: palette.textMuted,
    textShadowColor: 'rgba(2, 10, 9, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  }
});
