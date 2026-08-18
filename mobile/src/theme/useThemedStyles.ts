import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { AppColors } from './colors';
import { useAppTheme } from './useAppTheme';

/** Build StyleSheet from current theme colors (dark/light). */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: AppColors) => T,
): T {
  const { colors } = useAppTheme();
  return useMemo(() => StyleSheet.create(factory(colors)), [colors, factory]);
}

export function useScreenStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => {
    const { createScreenStyles } = require('./screenStyles');
    return createScreenStyles(colors);
  }, [colors]);
}

export function useListScreenStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => {
    const { createListScreenStyles } = require('./listScreenStyles');
    return createListScreenStyles(colors);
  }, [colors]);
}

export type { AppColors };
