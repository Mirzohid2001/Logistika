import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { colors as lightColors } from './colors';
import { createShadows } from './spacing';
import { resolveIsDark, useThemePreference } from '../context/ThemeContext';

const darkColors = {
  ...lightColors,
  background: '#101820',
  backgroundSecondary: '#141F28',
  backgroundTertiary: '#1B2933',
  surfaceMuted: '#15222B',
  surfaceElevated: '#18242E',
  cardBackground: '#18242E',
  inputBackground: '#111D25',
  surface: '#18242E',
  primaryGlow: '#123B3E',
  secondaryGlow: '#123B35',
  accentGlow: '#473321',
  successGlow: '#123A2D',
  warningGlow: '#46331F',
  dangerGlow: '#451F24',
  text: '#F4F8F9',
  textSecondary: '#B2C0C5',
  textTertiary: '#7E929A',
  border: '#30404A',
  borderLight: '#23333D',
  borderDark: '#41545F',
  shadow: '#000000',
  shadowTint: '#18C5C8',
  overlay: 'rgba(4, 10, 14, 0.72)',
  overlayLight: 'rgba(255, 255, 255, 0.06)',
};

export const useAppTheme = () => {
  const scheme = useColorScheme();
  const { preference, isReady } = useThemePreference();
  const isDark = resolveIsDark(preference, scheme);
  const colors = isDark ? darkColors : lightColors;
  const shadows = useMemo(() => createShadows(colors), [colors]);
  return useMemo(
    () => ({ isDark, preference, isReady, colors, shadows }),
    [isDark, preference, isReady, colors, shadows],
  );
};
