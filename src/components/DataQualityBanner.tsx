import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';
import type { AppDataQuality } from '../types';

type Props = {
  dataQuality: AppDataQuality;
};

export function DataQualityBanner({ dataQuality }: Props) {
  const messages: string[] = [];

  if (dataQuality.backendRequested && dataQuality.backendUnavailable) {
    messages.push('Backend snapshot is unavailable. Showing live source data instead.');
  }

  if (dataQuality.usingFallbackKp) {
    messages.push('KP is using a backup estimate because the upstream feed failed.');
  }

  if (dataQuality.fallbackWeatherSpotIds.length > 0) {
    const spotCount = dataQuality.fallbackWeatherSpotIds.length;
    messages.push(`Weather data is estimated for ${spotCount} spot${spotCount === 1 ? '' : 's'} because forecast fetches failed.`);
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Data quality notice</Text>
      {messages.map((message) => (
        <Text key={message} style={styles.message}>
          {message}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.warningSurface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.warning
  },
  eyebrow: {
    color: '#ffe7a3',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  message: {
    color: '#fff2c8',
    fontSize: 13,
    lineHeight: 19
  }
});
