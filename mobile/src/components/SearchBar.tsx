import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
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
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <View style={[styles.inputShell, focused && styles.inputShellFocused]}>
        <MaterialIcons name="search" size={20} color={focused ? colors.primary : colors.textTertiary} />
        <TextInput
          {...props}
          style={styles.input}
          placeholderTextColor={placeholderTextColor ?? colors.textTertiary}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          {...a11ySearchField(accessibilityLabel || props.placeholder || t('common.search'))}
        />
      </View>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: 'transparent',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    inputShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.inputBackground,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
    },
    inputShellFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceElevated,
    },
    input: {
      flex: 1,
      paddingVertical: spacing.md,
      fontSize: fontSize.md,
      color: colors.text,
      fontWeight: fontWeight.medium,
      minHeight: 44,
    },
  });
