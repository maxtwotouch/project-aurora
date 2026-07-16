import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space } from '../theme/tokens';
import { typography } from '../theme/type';
import type { AppDataQuality } from '../types';

type Props = {
  dataQuality: AppDataQuality;
};

export function DataQualityBanner({ dataQuality }: Props) {
  const { t } = useTranslation();
  const messages: string[] = [];

  if (dataQuality.backendRequested && dataQuality.backendUnavailable) {
    messages.push(t('dataQuality.backendUnavailable'));
  }

  if (dataQuality.usingFallbackKp) {
    messages.push(t('dataQuality.kpFallback'));
  }

  if (dataQuality.fallbackWeatherSpotIds.length > 0) {
    const spotCount = dataQuality.fallbackWeatherSpotIds.length;
    messages.push(t('dataQuality.weatherFallback', { count: spotCount }));
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.eyebrow}>{t('dataQuality.eyebrow')}</Text>
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
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: 1,
    borderColor: palette.warning,
    gap: 4
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.textOnWarningSurface,
    marginBottom: 2
  },
  message: {
    ...typography.bodySmall,
    color: palette.textOnWarningSurface
  }
});
