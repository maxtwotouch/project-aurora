import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';
import type { KpTrend } from '../types';

type Props = {
  kp: KpTrend;
};

const AVAILABLE_HOUR_OFFSETS = [0, 1, 4] as const;
const AURORA_SOURCE_URL = 'https://site.uit.no/spaceweather/data-and-products/aurora/tromso/';

function buildFrameUrl(hourOffset: number, refreshBucket: number) {
  const base = 'https://spaceweather2.uit.no/noswe/Aurora';
  const path = hourOffset === 0 ? 'Nowcast' : hourOffset === 1 ? 'Forecast1h' : 'Forecast4h';
  return `${base}/${path}/tromso.jpg?t=${refreshBucket}`;
}

export function AuroraMapScreen({ kp }: Props) {
  const introAnim = useRef(new Animated.Value(0)).current;
  const [hourOffset, setHourOffset] = useState<number>(0);
  const [timelineWidth, setTimelineWidth] = useState<number>(1);
  const [refreshBucket, setRefreshBucket] = useState<number>(Math.floor(Date.now() / (10 * 60 * 1000)));
  const [loadedFrameUrls, setLoadedFrameUrls] = useState<Record<string, boolean>>({});
  const [failedFrameUrls, setFailedFrameUrls] = useState<Record<string, boolean>>({});
  const selectedIndex = Math.max(
    0,
    AVAILABLE_HOUR_OFFSETS.indexOf(hourOffset as (typeof AVAILABLE_HOUR_OFFSETS)[number])
  );
  const maxIndex = AVAILABLE_HOUR_OFFSETS.length - 1;

  const updateFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(timelineWidth, x));
    const ratio = clamped / timelineWidth;
    const index = Math.round(ratio * maxIndex);
    setHourOffset(AVAILABLE_HOUR_OFFSETS[index]);
  };

  const onTimelineLayout = (event: LayoutChangeEvent) => {
    const width = Math.max(1, event.nativeEvent.layout.width);
    setTimelineWidth(width);
  };

  const kpAtOffset = useMemo(() => {
    return kp.hourly[hourOffset] ?? kp.hourly[kp.hourly.length - 1] ?? kp.current;
  }, [hourOffset, kp.current, kp.hourly]);

  const frameUrls = useMemo(
    () =>
      AVAILABLE_HOUR_OFFSETS.reduce<Record<number, string>>((acc, offset) => {
        acc[offset] = buildFrameUrl(offset, refreshBucket);
        return acc;
      }, {}),
    [refreshBucket]
  );
  const frameUrl = frameUrls[hourOffset];
  const overheadNow = kp.current >= 5 ? 'Likely overhead' : kp.current >= 3.5 ? 'Possible overhead' : 'Low overhead';
  const isCurrentFrameLoaded = Boolean(loadedFrameUrls[frameUrl]);
  const hasCurrentFrameFailed = Boolean(failedFrameUrls[frameUrl]);
  const peakIndex = kp.hourly.reduce((bestIndex, value, index, values) => {
    return value > values[bestIndex] ? index : bestIndex;
  }, 0);
  const peakTime = useMemo(() => {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + peakIndex);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    });
  }, [peakIndex]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true
    }).start();
  }, [introAnim]);

  useEffect(() => {
    const id = setInterval(() => {
      const nextBucket = Math.floor(Date.now() / (10 * 60 * 1000));
      setRefreshBucket((current) => (current === nextBucket ? current : nextBucket));
    }, 60 * 1000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLoadedFrameUrls({});
    setFailedFrameUrls({});
  }, [refreshBucket]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
    >
      <Animated.View
        style={[
          styles.headerCard,
          {
            opacity: introAnim,
            transform: [
              {
                translateY: introAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0]
                })
              }
            ]
          }
        ]}
      >
        <Text style={styles.eyebrow}>UiT feed</Text>
        <Text style={styles.title}>Aurora frames</Text>
        <Text style={styles.subtitle}>Switch between now, +1h, and +4h.</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.summaryRow,
          {
            opacity: introAnim,
            transform: [
              {
                translateY: introAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.summaryTile}>
          <Text style={styles.summaryLabel}>Overhead now</Text>
          <Text style={styles.summaryValue}>{overheadNow}</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryLabel}>Next peak</Text>
          <Text style={styles.summaryValue}>{peakTime}</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryLabel}>KP frame</Text>
          <Text style={styles.summaryValue}>{kpAtOffset.toFixed(1)}</Text>
        </View>
      </Animated.View>

      <View style={styles.frameWrap}>
        {!hasCurrentFrameFailed ? (
          <>
            {AVAILABLE_HOUR_OFFSETS.map((offset) => {
              const url = frameUrls[offset];
              const visible = offset === hourOffset;

              return (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={[styles.frameImage, visible ? styles.frameVisible : styles.frameHidden]}
                  resizeMode="cover"
                  onLoad={() => {
                    setLoadedFrameUrls((current) => ({ ...current, [url]: true }));
                  }}
                  onError={() => {
                    setFailedFrameUrls((current) => ({ ...current, [url]: true }));
                  }}
                />
              );
            })}
          </>
        ) : (
          <View style={styles.frameFallback}>
            <Text style={styles.frameFallbackTitle}>Aurora frame unavailable</Text>
            <Text style={styles.frameFallbackText}>
              The UiT image feed did not load. Open the source page directly to verify whether the feed is down or the frame path changed.
            </Text>
            <Pressable style={styles.sourceButton} onPress={() => void Linking.openURL(AURORA_SOURCE_URL)}>
              <Text style={styles.sourceButtonText}>Open UiT source</Text>
            </Pressable>
          </View>
        )}
        {!isCurrentFrameLoaded && !hasCurrentFrameFailed ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={palette.auroraGreen} />
            <Text style={styles.loadingText}>Loading aurora frame...</Text>
          </View>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.scrubberCard,
          {
            opacity: introAnim,
            transform: [
              {
                translateY: introAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0]
                })
              }
            ]
          }
        ]}
      >
        <Text style={styles.scrubberTitle}>Time</Text>
        <Text style={styles.scrubberMeta}>Nowcast, +1h, or +4h.</Text>
        <View
          style={styles.timelineTrack}
          onLayout={onTimelineLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => updateFromX(e.nativeEvent.locationX)}
          onResponderMove={(e) => updateFromX(e.nativeEvent.locationX)}
        >
          <View style={[styles.timelineFill, { width: `${(selectedIndex / maxIndex) * 100}%` }]} />
          <View style={[styles.timelineThumb, { left: (selectedIndex / maxIndex) * timelineWidth - 12 }]} />
        </View>
        <View style={styles.timelineLabels}>
          {AVAILABLE_HOUR_OFFSETS.map((offset) => {
            const active = hourOffset === offset;
            return (
              <Pressable key={offset} style={styles.timelineLabelPill} onPress={() => setHourOffset(offset)}>
                <Text style={[styles.timelineLabel, active ? styles.timelineLabelActive : null]}>
                  {offset === 0 ? 'Now' : `+${offset}h`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View style={[styles.legendCard, { opacity: introAnim }]}>
        <Text style={styles.legendTitle}>Source</Text>
        <Text style={styles.legendText}>NO-SPACE weather lab at UiT. Frame mode: {hourOffset === 0 ? 'Nowcast' : `Forecast +${hourOffset}h`}.</Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.night,
    padding: 14,
    paddingBottom: 28
  },
  headerCard: {
    backgroundColor: palette.nightPanel,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  title: {
    color: palette.textPrimary,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    marginBottom: 6
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12
  },
  summaryTile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  summaryValue: {
    color: palette.textPrimary,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800'
  },
  frameWrap: {
    minHeight: 240,
    height: 320,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardElevated
  },
  frameImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  frameVisible: {
    opacity: 1
  },
  frameHidden: {
    opacity: 0
  },
  frameFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10
  },
  frameFallbackTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  frameFallbackText: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center'
  },
  sourceButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.auroraGreen
  },
  sourceButtonText: {
    color: palette.textOnAurora,
    fontWeight: '800'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#061017a8'
  },
  loadingText: {
    marginTop: 8,
    color: palette.textSecondary
  },
  scrubberCard: {
    marginTop: 12,
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  scrubberTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  scrubberMeta: {
    color: palette.textSecondary,
    marginTop: 4,
    marginBottom: 12
  },
  timelineTrack: {
    height: 16,
    borderRadius: 999,
    backgroundColor: '#0d1923',
    borderWidth: 1,
    borderColor: '#335163',
    justifyContent: 'center'
  },
  timelineFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: palette.auroraGreen
  },
  timelineThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ecfff7',
    borderWidth: 2,
    borderColor: palette.auroraGreen
  },
  timelineLabels: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  timelineLabelPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#152835'
  },
  timelineLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  timelineLabelActive: {
    color: palette.auroraMint
  },
  legendCard: {
    marginTop: 12,
    backgroundColor: '#10202b',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#284657'
  },
  legendTitle: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3
  },
  legendText: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 19
  }
});
