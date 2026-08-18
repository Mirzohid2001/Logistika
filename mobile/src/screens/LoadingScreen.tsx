import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { ScreenBackground } from '../components/ScreenBackground';

const LoadingScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();

  return (
    <ScreenBackground withOrbs={false}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </ScreenBackground>
  );
};

const createStyles = (_colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

export default LoadingScreen;
