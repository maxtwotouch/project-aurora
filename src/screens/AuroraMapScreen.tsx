import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';
import type { KpTrend } from '../types';

type Props = {
  kp: KpTrend;
};

const AVAILABLE_HOUR_OFFSETS = [0, 1, 4] as const;

function buildFrameUrl(hourOffset: number) {
  const base = 'https://spaceweather2.uit.no/noswe/Aurora';
  const path = hourOffset === 0 ? 'Nowcast' : hourOffset === 1 ? 'Forecast1h' : 'Forecast4h';
  return `${base}/${path}/tromso.jpg?t=${Math.floor(Date.now() / (10 * 60 * 1000))}`;
}

export function AuroraMapScreen({ kp }: Props) {
  const [hourOffset, setHourOffset] = useState<number>(0);
  const [timelineWidth, setTimelineWidth] = useState<number>(1);
  const [loadingImage, setLoadingImage] = useState<boolean>(true);
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

  const frameUrl = useMemo(() => buildFrameUrl(hourOffset), [hourOffset]);
  const overheadNow = kp.current >= 5 ? 'Likely' : kp.current >= 3.5 ? 'Possible' : 'Low';
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
    // Prevent permanent spinner if image callbacks fail or hang.
    setLoadingImage(true);
    const timeout = setTimeout(() => {
      setLoadingImage(false);
    }, 12000);

    return () => clearTimeout(timeout);
  }, [frameUrl]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Tromso Aurora Outlook</Text>
        <Text style={styles.summaryLine}>Overhead now: {overheadNow}</Text>
        <Text style={styles.summaryLine}>Next peak: {peakTime}</Text>
      </View>

      <View style={styles.frameWrap}>
        <Image
          source={{ uri: frameUrl }}
          style={styles.frameImage}
          resizeMode="cover"
          onLoadStart={() => setLoadingImage(true)}
          onLoadEnd={() => setLoadingImage(false)}
          onError={() => setLoadingImage(false)}
        />
        {loadingImage ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={palette.auroraGreen} />
            <Text style={styles.loadingText}>Loading aurora frame...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Official UiT Aurora Frames (Tromso)</Text>
        <Text style={styles.legendText}>Source: NO-SPACE weather lab at UiT.</Text>
        <Text style={styles.legendText}>Frame time: {hourOffset === 0 ? 'Nowcast' : `Forecast +${hourOffset}h`} | KP {kpAtOffset.toFixed(1)}</Text>
      </View>

      <View style={styles.timePickerWrap}>
        <Text style={styles.timeTitle}>Drag Time: Now, +1h, +4h</Text>
        <View
          style={styles.timelineTrack}
          onLayout={onTimelineLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => updateFromX(e.nativeEvent.locationX)}
          onResponderMove={(e) => updateFromX(e.nativeEvent.locationX)}
        >
          <View style={[styles.timelineFill, { width: `${(selectedIndex / maxIndex) * 100}%` }]} />
          <View
            style={[
              styles.timelineThumb,
              { left: (selectedIndex / maxIndex) * timelineWidth - 10 }
            ]}
          />
        </View>
        <View style={styles.timelineLabels}>
          <Text style={styles.timelineLabel}>Now</Text>
          <Text style={styles.timelineLabel}>+1h</Text>
          <Text style={styles.timelineLabel}>+4h</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.night,
    padding: 14
  },
  frameWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardElevated
  },
  summaryCard: {
    marginBottom: 10,
    backgroundColor: '#101a2fd9',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2d466b'
  },
  summaryTitle: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2
  },
  summaryLine: {
    color: palette.textSecondary,
    fontSize: 14
  },
  frameImage: {
    width: '100%',
    height: '100%'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#03071299'
  },
  loadingText: {
    marginTop: 8,
    color: palette.textSecondary
  },
  legend: {
    marginTop: 10,
    backgroundColor: '#101a2fd9',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2d466b'
  },
  legendTitle: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2
  },
  legendText: {
    color: palette.textSecondary,
    fontSize: 12,
    textAlign: 'center'
  },
  timePickerWrap: {
    marginTop: 10,
    backgroundColor: '#101a2fe8',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2d466b'
  },
  timeTitle: {
    color: palette.textPrimary,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  timelineTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: '#0b1424',
    borderWidth: 1,
    borderColor: '#3c5275',
    justifyContent: 'center'
  },
  timelineFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#2adf92'
  },
  timelineThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e7fff8',
    borderWidth: 2,
    borderColor: '#2adf92'
  },
  timelineLabels: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  timelineLabel: {
    color: palette.textSecondary,
    fontSize: 12
  }
});
