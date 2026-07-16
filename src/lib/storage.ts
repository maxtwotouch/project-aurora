import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny key/value persistence wrapper shared by anything that needs a small
 * persisted preference: the analytics consent choice (src/analytics/consent.ts)
 * and the manually-selected UI language (src/i18n/index.ts). Deliberately the
 * single seam between that preference state and the underlying platform
 * storage, so nothing else in the app needs to know "web uses localStorage,
 * native uses AsyncStorage".
 *
 * Failures are swallowed on purpose: losing a persisted value just means the
 * caller falls back to its own safe default (e.g. 'unset' consent, or the
 * device-detected language) next launch -- it must never throw into UI code
 * or crash the app.
 */

export async function getStoredItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch {
    // Best-effort persistence only.
  }
}
