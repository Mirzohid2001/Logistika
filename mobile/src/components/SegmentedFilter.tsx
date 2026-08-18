import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { borderRadius, fontSize, fontWeight, shadows, spacing } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';

export interface SegmentedFilterOption {
  key: string;
  label: string;
}

interface SegmentedFilterProps {
  value: string;
  options: SegmentedFilterOption[];
  onChange: (key: string) => void;
  accentColor?: string;
}

export const SegmentedFilter: React.FC<SegmentedFilterProps> = ({
  value,
  options,
  onChange,
  accentColor,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = accentColor ?? colors.primary;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.chip,
              active && { backgroundColor: accent, borderColor: accent, ...shadows.colored(accent) },
            ]}
            onPress={() => onChange(option.key)}
            activeOpacity={0.85}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.round,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.borderLight,
      minHeight: 42,
      justifyContent: 'center',
      ...shadows.sm,
    },
    chipText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.textLight,
    },
  });
