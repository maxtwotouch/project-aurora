import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny key/value persistence wrapper used only for the analytics consent
 * choice. Deliberately the single seam between consent state and the
 * underlying platform storage, so nothing else in the app needs to know
 * "web uses localStorage, native uses AsyncStorage".
 *
 * Failures are swallowed on purpose: losing the persisted choice just
 * means we ask again next launch (safe default of 'unset'), it must never
 * throw into UI code or crash the app.
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
