import React, { ReactNode, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { spacing, fontSize, fontWeight } from '../../theme';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { ScreenBackground } from '../ScreenBackground';
import { Card } from '../Card';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => {
  const insets = useSafeAreaInsets();
  const { colors, shadows: themedShadows } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors, themedShadows), [colors, themedShadows]);

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, spacing.lg) + spacing.md,
              paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.lg,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <MaterialIcons name="local-shipping" size={34} color={colors.textLight} />
              </View>
            </View>
            <View style={styles.accentRow}>
              <View style={[styles.accentDot, { backgroundColor: colors.primary }]} />
              <View style={[styles.accentDot, { backgroundColor: colors.logisticsAccent }]} />
              <View style={[styles.accentDot, { backgroundColor: colors.secondary }]} />
            </View>
            <Text style={styles.brandName}>Logistika</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <Card variant="elevated" padding="xl" style={styles.formCard}>
            {children}
          </Card>

          <View style={styles.trustRow}>
            <MaterialIcons name="verified-user" size={16} color={colors.success} />
            <Text style={styles.trustText}>{t('authLayout.secureLogin')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

interface AuthFooterProps {
  text: string;
  linkText: string;
  onPress: () => void;
}

export const AuthFooter: React.FC<AuthFooterProps> = ({ text, linkText, onPress }) => {
  const { colors, shadows: themedShadows } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, themedShadows), [colors, themedShadows]);

  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{text}</Text>
      <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={styles.footerLink}>{linkText}</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  themedShadows: ReturnType<typeof useAppTheme>['shadows'],
) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    brandBlock: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    logoOuter: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: colors.primaryGlow,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: `${colors.primary}33`,
    },
    logoInner: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...themedShadows.colored(colors.primaryDark),
    },
    accentRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.md,
    },
    accentDot: {
      width: 24,
      height: 4,
      borderRadius: 2,
    },
    brandName: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.primary,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    title: {
      fontSize: fontSize.xxxl,
      fontWeight: fontWeight.extrabold,
      color: colors.text,
      marginBottom: spacing.xs,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      fontWeight: fontWeight.medium,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: spacing.md,
      maxWidth: 320,
    },
    formCard: {
      marginVertical: 0,
    },
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.lg,
    },
    trustText: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      fontWeight: fontWeight.semibold,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: spacing.lg,
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    footerText: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      fontWeight: fontWeight.medium,
    },
    footerLink: {
      fontSize: fontSize.md,
      color: colors.primary,
      fontWeight: fontWeight.bold,
      paddingVertical: spacing.sm,
      minHeight: 44,
      textAlignVertical: 'center',
    },
  });
