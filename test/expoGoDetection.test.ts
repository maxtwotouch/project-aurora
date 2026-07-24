// Tests for the pure Expo Go detection logic in
// src/notifications/expoGoDetection.ts -- no `expo-constants` or
// `@react-native-firebase/*` import anywhere in this file's dependency
// graph, so it runs the same way under plain node:test as
// alertsClient.test.ts / analytics-core.test.ts. See expoGoDetection.ts's
// own header for why this needs to be a pure, importable-without-native
// function at all.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isExpoGoEnvironment } from '../src/notifications/expoGoDetection.js';

describe('expoGoDetection: isExpoGoEnvironment', () => {
  test('executionEnvironment "storeClient" is Expo Go', () => {
    assert.equal(isExpoGoEnvironment({ executionEnvironment: 'storeClient' }), true);
  });

  test('appOwnership "expo" (deprecated signal) is still treated as Expo Go', () => {
    assert.equal(isExpoGoEnvironment({ appOwnership: 'expo' }), true);
  });

  test('both signals unset is NOT Expo Go', () => {
    assert.equal(isExpoGoEnvironment({}), false);
    assert.equal(isExpoGoEnvironment({ executionEnvironment: undefined, appOwnership: undefined }), false);
  });

  test('"standalone" execution environment is NOT Expo Go', () => {
    assert.equal(isExpoGoEnvironment({ executionEnvironment: 'standalone' }), false);
  });

  test('"bare" execution environment is NOT Expo Go', () => {
    assert.equal(isExpoGoEnvironment({ executionEnvironment: 'bare' }), false);
  });

  test('explicit null values are NOT Expo Go', () => {
    assert.equal(isExpoGoEnvironment({ executionEnvironment: null, appOwnership: null }), false);
  });
});
