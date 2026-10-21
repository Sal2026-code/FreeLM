/**
 * FreeLM — mobile motion.
 *
 * The React Native counterpart to the web app's CSS motion system. Same
 * durations, same easing intent, implemented with the built-in `Animated`
 * API so there is no extra dependency.
 */

import { Easing } from 'react-native';

export const duration = {
  micro: 100,
  short: 150,
  medium: 250,
  long: 400,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  accelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

/** Fade + rise, used for content that appears. */
export function enterTiming(toValue = 1) {
  return {
    toValue,
    duration: duration.medium,
    easing: easing.decelerate,
    useNativeDriver: true,
  };
}

/** A gentle press scale. */
export function pressTiming(toValue = 1) {
  return {
    toValue,
    duration: duration.short,
    easing: easing.standard,
    useNativeDriver: true,
  };
}
