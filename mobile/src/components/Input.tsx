import React, { useMemo } from 'react';
import { TextInput, Text, View, StyleSheet, TextInputProps, Platform } from 'react-native';
import { borderRadius, spacing, shadows, fontSize, fontWeight } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  accessibilityLabel?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  style,
  leftIcon,
  rightIcon,
  accessibilityLabel,
  ...props
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const inputProps: any = {
    ...props,
  };

  if (Platform.OS === 'ios' && props.secureTextEntry) {
    inputProps.textContentType = 'oneTimeCode';
    inputProps.passwordRules = 'required: *;';
    inputProps.autoComplete = 'off';
    inputProps.autoCompleteType = 'off';
    inputProps.autoCorrect = false;
    inputProps.spellCheck = false;
    inputProps.importantForAutofill = 'no';
    inputProps.keyboardType = 'default';
  }

  if (Platform.OS === 'android' && props.secureTextEntry) {
    inputProps.importantForAutofill = 'no';
    inputProps.autoComplete = 'off';
  }

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputContainer}>
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            leftIcon && styles.inputWithLeftIcon,
            rightIcon && styles.inputWithRightIcon,
            error && styles.inputError,
            style,
          ]}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={accessibilityLabel || label}
          {...inputProps}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.xl,
    },
    label: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.md,
      letterSpacing: 0.3,
    },
    inputContainer: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.borderLight,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      fontSize: fontSize.base,
      backgroundColor: colors.inputBackground,
      color: colors.text,
      fontWeight: fontWeight.medium,
      ...shadows.sm,
    },
    inputWithLeftIcon: {
      paddingLeft: spacing.xxxl + spacing.md,
    },
    inputWithRightIcon: {
      paddingRight: spacing.xxxl + spacing.md,
    },
    inputError: {
      borderColor: colors.danger,
      backgroundColor: colors.danger + '10',
      borderWidth: 2,
    },
    leftIcon: {
      position: 'absolute',
      left: spacing.lg,
      zIndex: 1,
    },
    rightIcon: {
      position: 'absolute',
      right: spacing.lg,
      zIndex: 1,
    },
    errorText: {
      color: colors.danger,
      fontSize: fontSize.sm,
      marginTop: spacing.sm,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.2,
    },
  });
