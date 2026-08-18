import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { OrderRoutePreview } from './OrderRoutePreview';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useThemedStyles, type AppColors } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

export interface OrderListCardProps {
  orderLabel: string;
  statusLabel: string;
  statusColor: string;
  title?: string | null;
  departureCity?: string;
  destinationCity?: string;
  actionHint?: string;
  partyLabel?: string;
  partyName?: string;
  dateLabel: string;
  amountLabel?: string;
  onPress: () => void;
}

export const OrderListCard: React.FC<OrderListCardProps> = ({
  orderLabel,
  statusLabel,
  statusColor,
  title,
  departureCity,
  destinationCity,
  actionHint,
  partyLabel,
  partyName,
  dateLabel,
  amountLabel,
  onPress,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress}>
      <Card variant="elevated" style={styles.card} padding="md">
        <View style={styles.header}>
          <Text style={styles.orderId}>{orderLabel}</Text>
          <StatusBadge label={statusLabel} color={statusColor} />
        </View>

        {!!title && (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        )}

        {(departureCity || destinationCity) && (
          <OrderRoutePreview from={departureCity || ''} to={destinationCity || ''} />
        )}

        {!!actionHint && <Text style={styles.actionHint}>{actionHint}</Text>}

        {!!partyLabel && !!partyName && (
          <View style={styles.partyRow}>
            <MaterialIcons name="person-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.partyLabel}>{partyLabel}</Text>
            <Text style={styles.partyName} numberOfLines={1}>
              {partyName}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <MaterialIcons name="schedule" size={14} color={colors.textTertiary} />
            <Text style={styles.date}>{dateLabel}</Text>
          </View>
          {!!amountLabel && <Text style={styles.amount}>{amountLabel}</Text>}
          <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginVertical: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    orderId: {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.extrabold,
      color: colors.text,
      letterSpacing: -0.3,
    },
    title: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      lineHeight: 22,
    },
    actionHint: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primary,
      marginBottom: spacing.sm,
    },
    partyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceMuted,
      borderRadius: borderRadius.md,
    },
    partyLabel: {
      fontSize: fontSize.sm,
      color: colors.textTertiary,
      fontWeight: fontWeight.medium,
    },
    partyName: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    footerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    date: {
      fontSize: fontSize.sm,
      color: colors.textTertiary,
      fontWeight: fontWeight.medium,
    },
    amount: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.primary,
    },
  });
