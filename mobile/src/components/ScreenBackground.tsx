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
          <View style={styles.signalLine} pointerEvents="none" />
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
    signalLine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.primary,
      opacity: 0.32,
    },
    orbPrimary: {
      position: 'absolute',
      top: -180,
      right: -110,
      width: 360,
      height: 360,
      borderRadius: 180,
      backgroundColor: colors.primaryGlow,
      opacity: 0.34,
    },
    orbAccent: {
      position: 'absolute',
      top: 220,
      left: -140,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: colors.accentGlow,
      opacity: 0.16,
    },
    orbSecondary: {
      position: 'absolute',
      bottom: -160,
      right: -100,
      width: 320,
      height: 320,
      borderRadius: 160,
      backgroundColor: colors.secondaryGlow,
      opacity: 0.2,
    },
  });
