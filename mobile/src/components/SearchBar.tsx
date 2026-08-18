import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useTranslation } from '../hooks/useTranslation';
import { a11ySearchField } from '../utils/accessibility';

interface SearchBarProps extends Omit<TextInputProps, 'style'> {
  containerStyle?: TextInputProps['style'];
  accessibilityLabel?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  containerStyle,
  placeholderTextColor,
  accessibilityLabel,
  ...props
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        style={styles.input}
        placeholderTextColor={placeholderTextColor ?? colors.textTertiary}
        {...a11ySearchField(accessibilityLabel || props.placeholder || t('common.search'))}
        {...props}
      />
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    input: {
      backgroundColor: colors.backgroundTertiary,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.md,
      color: colors.text,
      fontWeight: fontWeight.medium,
      minHeight: 44,
    },
  });
