import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Card } from './Card';
import { Button } from './Button';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import type { OrderNextAction } from '../utils/orderWorkflow';

interface Props {
  action: OrderNextAction;
  t: (key: string, options?: Record<string, unknown>) => string;
  onPressCta?: () => void;
  onPressSecondaryCta?: () => void;
  ctaLoading?: boolean;
}

export const OrderNextActionCard: React.FC<Props> = ({
  action,
  t,
  onPressCta,
  onPressSecondaryCta,
  ctaLoading = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const isWait = action.tone === 'wait';

  return (
    <Card
      style={isWait ? styles.waitCard : styles.actionCard}
      variant={isWait ? 'soft' : 'elevated'}>
      <View style={styles.row}>
        <View style={[styles.iconWell, isWait ? styles.iconWait : styles.iconAction]}>
          <MaterialIcons
            name={isWait ? 'hourglass-empty' : 'flag'}
            size={20}
            color={isWait ? colors.warning : colors.primary}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.kicker}>{t('orders.nextAction.kicker')}</Text>
          <Text style={styles.title}>{t(action.titleKey)}</Text>
          <Text style={styles.hint}>{t(action.hintKey)}</Text>
        </View>
      </View>
      {action.ctaKey && onPressCta ? (
        <Button
          title={t(action.ctaKey)}
          onPress={onPressCta}
          loading={ctaLoading}
          variant="primary"
          style={styles.cta}
        />
      ) : null}
      {action.secondaryCtaKey && onPressSecondaryCta ? (
        <Button
          title={t(action.secondaryCtaKey)}
          onPress={onPressSecondaryCta}
          loading={ctaLoading}
          variant="outline"
          style={styles.secondaryCta}
        />
      ) : null}
    </Card>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    actionCard: {
      marginBottom: spacing.md,
      borderColor: `${colors.primary}33`,
      borderWidth: 1,
    },
    waitCard: {
      marginBottom: spacing.md,
      backgroundColor: colors.warningGlow,
      borderColor: `${colors.warning}40`,
      borderWidth: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    iconWell: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconAction: {
      backgroundColor: colors.primaryGlow,
    },
    iconWait: {
      backgroundColor: `${colors.warning}22`,
    },
    copy: {
      flex: 1,
    },
    kicker: {
      fontSize: 11,
      fontWeight: fontWeight.semibold,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: 4,
    },
    hint: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    cta: {
      marginTop: spacing.md,
    },
    secondaryCta: {
      marginTop: spacing.sm,
    },
  });
