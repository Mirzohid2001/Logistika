import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';
import { a11yHeader } from '../utils/accessibility';

interface SectionEmptyNoteProps {
  message?: string;
  title?: string;
}

export const SectionEmptyNote: React.FC<SectionEmptyNoteProps> = ({ message, title }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const heading = title || t('common.sectionNoData');

  return (
    <View style={styles.container} {...a11yHeader(heading)}>
      <MaterialIcons name="insights" size={22} color={colors.textTertiary} />
      <Text style={styles.title}>{heading}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
    },
    title: {
      marginTop: spacing.sm,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    message: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
