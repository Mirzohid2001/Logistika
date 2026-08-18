import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

interface MapRecenterFabProps {
  visible: boolean;
  label: string;
  onPress: () => void;
}

export const MapRecenterFab: React.FC<MapRecenterFabProps> = ({ visible, label, onPress }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  if (!visible) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <MaterialIcons name="navigation" size={26} color={colors.primary} />
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 16,
      bottom: '36%',
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.borderLight,
      zIndex: 4,
    },
  });
