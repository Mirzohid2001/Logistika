import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, fontSize, fontWeight, spacing } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

type Option = { value: string; label: string };

type ChipSelectProps = {
  options: Option[];
  value?: string | string[];
  multiple?: boolean;
  onChange: (value: any) => void;
};

export const ChipSelect: React.FC<ChipSelectProps> = ({ options, value, multiple, onChange }) => {
  const styles = useThemedStyles(createStyles);
  const selected = multiple ? new Set((value as string[]) || []) : new Set(value ? [value as string] : []);

  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const active = selected.has(option.value);
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              if (multiple) {
                const next = new Set(selected);
                if (next.has(option.value)) {
                  next.delete(option.value);
                } else {
                  next.add(option.value);
                }
                onChange(Array.from(next));
                return;
              }
              onChange(option.value === value ? '' : option.value);
            }}>
            <Text style={[styles.text, active && styles.textActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const createStyles = (colors: AppColors) => ({
  wrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  text: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  textActive: {
    color: colors.textLight,
    fontWeight: fontWeight.semibold,
  },
});
