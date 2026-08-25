import React, { useMemo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface ScreenBackgroundProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  withOrbs?: boolean;
}

export const ScreenBackground: React.FC<ScreenBackgroundProps> = ({
  children,
  style,
  withOrbs = true,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.root, style]}>
      {withOrbs && (
        <>
          <View style={styles.orbPrimary} pointerEvents="none" />
          <View style={styles.orbAccent} pointerEvents="none" />
          <View style={styles.orbSecondary} pointerEvents="none" />
        </>
      )}
      {children}
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    orbPrimary: {
      position: 'absolute',
      top: -140,
      right: -70,
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: colors.primaryGlow,
      opacity: 0.55,
    },
    orbAccent: {
      position: 'absolute',
      top: 80,
      left: -90,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: colors.accentGlow,
      opacity: 0.35,
    },
    orbSecondary: {
      position: 'absolute',
      bottom: -100,
      right: -40,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: colors.secondaryGlow,
      opacity: 0.28,
    },
  });
