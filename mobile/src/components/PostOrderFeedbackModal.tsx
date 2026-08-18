import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { User } from '../types';
import { UserReputationBadge } from './UserReputationBadge';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface PostOrderFeedbackModalProps {
  visible: boolean;
  counterparty?: User | null;
  onRate: () => void;
  onComplaint: () => void;
  onDismiss: () => void;
}

export const PostOrderFeedbackModal: React.FC<PostOrderFeedbackModalProps> = ({
  visible,
  counterparty,
  onRate,
  onComplaint,
  onDismiss,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('postOrderFeedback.title')}</Text>
          <Text style={styles.message}>{t('postOrderFeedback.message')}</Text>
          {counterparty && (
            <View style={styles.counterparty}>
              <Text style={styles.counterpartyName}>
                {counterparty.first_name} {counterparty.last_name}
              </Text>
              <UserReputationBadge user={counterparty} compact />
            </View>
          )}
          <TouchableOpacity style={styles.primaryButton} onPress={onRate}>
            <Text style={styles.primaryButtonText}>⭐ {t('postOrderFeedback.rate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onComplaint}>
            <Text style={styles.secondaryButtonText}>{t('postOrderFeedback.complaint')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>{t('postOrderFeedback.later')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  counterparty: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  counterpartyName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: colors.textLight,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: fontWeight.medium,
    fontSize: fontSize.md,
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dismissButtonText: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
  },
});
