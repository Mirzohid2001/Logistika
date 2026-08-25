import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { borderRadius, fontSize, fontWeight } from '../theme';

interface StatusBadgeProps {
  label: string;
  color: string;
  compact?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, color, compact }) => {
  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, compact && styles.textCompact, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: borderRadius.round,
      borderWidth: 1,
      maxWidth: '52%',
    },
    badgeCompact: {
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    text: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      letterSpacing: 0.2,
      flexShrink: 1,
    },
    textCompact: {
      fontSize: fontSize.xs,
    },
  });
