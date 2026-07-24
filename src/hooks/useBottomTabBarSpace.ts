import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

/**
 * Height (in px) that the floating bottom tab bar occupies over the scene, or
 * 0 when rendered outside a tab navigator.
 *
 * @react-navigation/bottom-tabs renders every scene as a `StyleSheet.
 * absoluteFill` layer that spans the *full* container height, with the tab bar
 * drawn on top of its bottom edge (see BottomTabView) -- so scroll content
 * slides under the bar unless the screen reserves this much bottom padding
 * itself. Our tab screens also set `automaticallyAdjustContentInsets={false}` /
 * `contentInsetAdjustmentBehavior="never"`, opting out of the iOS automatic
 * inset that would otherwise handle this, which is why each one has to add it
 * explicitly.
 *
 * Reads the context directly rather than calling `useBottomTabBarHeight()` so
 * it returns 0 instead of throwing if ever used outside a tab navigator.
 */
export function useBottomTabBarSpace(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
