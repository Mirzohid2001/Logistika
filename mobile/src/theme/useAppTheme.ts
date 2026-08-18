import { useColorScheme } from 'react-native';
import { colors as lightColors } from './colors';
import { createShadows } from './spacing';
import { resolveIsDark, useThemePreference } from '../context/ThemeContext';

const darkColors = {
  ...lightColors,
  background: '#0B0F17',
  backgroundSecondary: '#121826',
  backgroundTertiary: '#1A2233',
  surfaceMuted: '#151C2B',
  surfaceElevated: '#161E2E',
  cardBackground: '#161E2E',
  inputBackground: '#1A2233',
  surface: '#161E2E',
  primaryGlow: '#123A73',
  accentGlow: '#4A2B12',
  successGlow: '#0F3D2E',
  warningGlow: '#4A3410',
  dangerGlow: '#4A1515',
  text: '#F1F5F9',
  textSecondary: '#A8B4C8',
  textTertiary: '#6B7A92',
  border: '#2A3548',
  borderLight: '#222B3D',
  borderDark: '#3A4760',
  shadow: '#000000',
  shadowTint: '#3B8BFF',
};

export const useAppTheme = () => {
  const scheme = useColorScheme();
  const { preference, isReady } = useThemePreference();
  const isDark = resolveIsDark(preference, scheme);
  const colors = isDark ? darkColors : lightColors;
  return {
    isDark,
    preference,
    isReady,
    colors,
    shadows: createShadows(colors),
  };
};
