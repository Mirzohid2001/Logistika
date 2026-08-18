import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Card } from '../Card';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

type ProfileMenuItemProps = {
  icon: string;
  label: string;
  subtitle?: string;
  iconColor?: string;
  iconBackground?: string;
  badge?: string | number;
  warningDot?: boolean;
  onPress: () => void;
  isLast?: boolean;
};

export const ProfileMenuItem: React.FC<ProfileMenuItemProps> = ({
  icon,
  label,
  subtitle,
  iconColor,
  iconBackground,
  badge,
  warningDot,
  onPress,
  isLast = false,
}) => {
  const styles = useThemedStyles(createItemStyles);
  const { colors } = useAppTheme();

  return (
    <>
      <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.72}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: iconBackground ?? colors.primaryGlow },
          ]}>
          <MaterialIcons name={icon} size={20} color={iconColor ?? colors.primary} />
        </View>
        <View style={styles.body}>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.trailing}>
          {warningDot ? (
            <View style={styles.warningDot}>
              <Text style={styles.warningDotText}>!</Text>
            </View>
          ) : null}
          {badge != null && badge !== '' ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{badge}</Text>
            </View>
          ) : null}
          <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
      {!isLast ? <View style={styles.divider} /> : null}
    </>
  );
};

type ProfileMenuSectionProps = {
  title?: string;
  children: React.ReactNode;
};

export const ProfileMenuSection: React.FC<ProfileMenuSectionProps> = ({ title, children }) => {
  const styles = useThemedStyles(createSectionStyles);
  const childArray = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Card variant="soft" style={styles.card}>
        {childArray.map((child, index) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<{ isLast?: boolean }>, {
                isLast: index === childArray.length - 1,
              })
            : child,
        )}
      </Card>
    </View>
  );
};

const createSectionStyles = (colors: AppColors) =>
  StyleSheet.create({
    section: {
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: colors.textTertiary,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: {
      marginVertical: 0,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
  });

const createItemStyles = (colors: AppColors) =>
  StyleSheet.create({
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.xs,
      minHeight: 56,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    body: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    label: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      lineHeight: 20,
    },
    subtitle: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    trailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 40 + spacing.md + spacing.xs,
      marginRight: spacing.xs,
    },
    warningDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningDotText: {
      color: colors.textLight,
      fontSize: 12,
      fontWeight: fontWeight.bold,
    },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: {
      color: colors.textLight,
      fontSize: 11,
      fontWeight: fontWeight.bold,
    },
  });
