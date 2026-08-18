import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAppTheme } from '../../theme/useAppTheme';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';

interface AuthRoleSelectorProps {
  isDriver: boolean;
  onChange: (isDriver: boolean) => void;
  clientLabel: string;
  driverLabel: string;
}

export const AuthRoleSelector: React.FC<AuthRoleSelectorProps> = ({
  isDriver,
  onChange,
  clientLabel,
  driverLabel,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.option, !isDriver && styles.optionActive]}
        onPress={() => onChange(false)}
        activeOpacity={0.85}
        accessibilityRole="radio"
        accessibilityState={{ selected: !isDriver }}>
        <MaterialIcons
          name="business-center"
          size={20}
          color={!isDriver ? colors.primary : colors.textTertiary}
        />
        <Text style={[styles.optionText, !isDriver && styles.optionTextActive]}>{clientLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.option, isDriver && styles.optionActive]}
        onPress={() => onChange(true)}
        activeOpacity={0.85}
        accessibilityRole="radio"
        accessibilityState={{ selected: isDriver }}>
        <MaterialIcons
          name="local-shipping"
          size={20}
          color={isDriver ? colors.primary : colors.textTertiary}
        />
        <Text style={[styles.optionText, isDriver && styles.optionTextActive]}>{driverLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    option: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: colors.borderLight,
      backgroundColor: colors.surfaceMuted,
      minHeight: 52,
    },
    optionActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGlow,
    },
    optionText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
      textAlign: 'center',
      flexShrink: 1,
    },
    optionTextActive: {
      color: colors.primary,
      fontWeight: fontWeight.bold,
    },
  });
