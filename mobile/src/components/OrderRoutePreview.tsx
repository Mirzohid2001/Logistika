import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { borderRadius, fontSize, fontWeight, spacing } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';

interface OrderRoutePreviewProps {
  from: string;
  to: string;
}

export const OrderRoutePreview: React.FC<OrderRoutePreviewProps> = ({ from, to }) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.route}>
      <View style={styles.point}>
        <View style={[styles.dot, styles.dotPickup]} />
        <Text style={styles.city} numberOfLines={1}>
          {from || '...'}
        </Text>
      </View>
      <View style={styles.connector}>
        <View style={styles.line} />
        <MaterialIcons name="local-shipping" size={16} color={colors.primary} />
        <View style={styles.line} />
      </View>
      <View style={styles.point}>
        <View style={[styles.dot, styles.dotDest]} />
        <Text style={styles.city} numberOfLines={1}>
          {to || '...'}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    route: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    point: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minWidth: 0,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: borderRadius.round,
    },
    dotPickup: {
      backgroundColor: colors.logisticsAccent,
    },
    dotDest: {
      backgroundColor: colors.success,
    },
    city: {
      flex: 1,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    connector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      width: 56,
    },
    line: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.border,
    },
  });
