import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Complaint } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from '../../hooks/useTranslation';
import { complaintsService } from '../../services/complaintsService';
import { toastService } from '../../services/toastService';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

const StaffComplaintDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const initialComplaint = (route.params as { complaint: Complaint }).complaint;
  const [complaint, setComplaint] = useState(initialComplaint);
  const [adminNotes, setAdminNotes] = useState(complaint.admin_notes || '');
  const [resolutionAction, setResolutionAction] = useState<
    'none' | 'warn' | 'suspend_7' | 'suspend_30' | 'block'
  >('none');
  const [submitting, setSubmitting] = useState(false);

  const isClosed = complaint.status === 'resolved' || complaint.status === 'dismissed';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return colors.success;
      case 'dismissed':
        return colors.textTertiary;
      case 'in_review':
        return colors.warning;
      default:
        return colors.danger;
    }
  };

  const handleResolve = (status: 'in_review' | 'resolved' | 'dismissed') => {
    const confirmMessage =
      status === 'resolved'
        ? t('complaints.staff.confirmResolve')
        : status === 'dismissed'
          ? t('complaints.staff.confirmDismiss')
          : t('complaints.staff.confirmInReview');

    Alert.alert(t('common.confirm'), confirmMessage, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          try {
            setSubmitting(true);
            const updated = await complaintsService.resolveComplaint(complaint.id, {
              status,
              admin_notes: adminNotes.trim() || undefined,
              action: status === 'resolved' ? resolutionAction : 'none',
            });
            setComplaint(updated);
            setAdminNotes(updated.admin_notes || '');
            toastService.success(t('complaints.staff.resolvedSuccess'));
            if (status === 'resolved' || status === 'dismissed') {
              navigation.goBack();
            }
          } catch (error: any) {
            toastService.error(error?.message || t('complaints.staff.resolveError'));
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const userName = (user?: Complaint['from_user']) =>
    user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || `#${user.id}` : '—';

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('complaints.staff.detailTitle')} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <Card variant="soft" style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.orderLabel}>
              {t('complaints.orderLabel')} #{complaint.order_id}
            </Text>
            <View
              style={[styles.statusBadge, { backgroundColor: `${statusColor(complaint.status)}22` }]}>
              <Text style={[styles.statusText, { color: statusColor(complaint.status) }]}>
                {complaint.status_display || complaint.status}
              </Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {t('complaints.staff.filedBy')}: {userName(complaint.from_user)}
          </Text>
          <Text style={styles.meta}>
            {t('complaints.staff.againstUser')}: {userName(complaint.to_user)}
          </Text>
          <Text style={styles.category}>
            {complaint.category_display || t(`complaints.categories.${complaint.category}`)}
          </Text>
          <Text style={styles.description}>{complaint.description}</Text>
          <Text style={styles.date}>{formatDate(complaint.created_at)}</Text>
        </Card>

        <Card variant="soft" style={styles.card}>
          <Text style={styles.sectionTitle}>{t('complaints.staff.adminNotes')}</Text>
          {isClosed ? (
            <Text style={styles.notesReadonly}>
              {complaint.admin_notes?.trim() || t('complaints.staff.noAdminNotes')}
            </Text>
          ) : (
            <Input
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder={t('complaints.staff.adminNotesPlaceholder')}
              multiline
              numberOfLines={4}
              style={styles.notesInput}
              textAlignVertical="top"
            />
          )}
        </Card>

        {!isClosed && (
          <View style={styles.actions}>
            <Text style={styles.actionLabel}>
              {t('complaints.staff.resolutionAction', { defaultValue: 'Jazo' })}
            </Text>
            <View style={styles.actionRow}>
              {(['none', 'warn', 'suspend_7', 'suspend_30', 'block'] as const).map((action) => (
                <Button
                  key={action}
                  title={t(`complaints.staff.actions.${action}`, { defaultValue: action })}
                  variant={resolutionAction === action ? 'primary' : 'outline'}
                  onPress={() => setResolutionAction(action)}
                  style={styles.actionChip}
                />
              ))}
            </View>
            {complaint.status === 'pending' && (
              <Button
                title={t('complaints.staff.markInReview')}
                variant="warning"
                onPress={() => handleResolve('in_review')}
                loading={submitting}
                disabled={submitting}
              />
            )}
            <Button
              title={t('complaints.staff.markResolved')}
              variant="success"
              onPress={() => handleResolve('resolved')}
              loading={submitting}
              disabled={submitting}
            />
            <Button
              title={t('complaints.staff.markDismissed')}
              variant="outline"
              onPress={() => handleResolve('dismissed')}
              loading={submitting}
              disabled={submitting}
            />
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    card: {
      marginBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    orderLabel: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
    },
    statusText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
    },
    meta: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    category: {
      fontSize: fontSize.md,
      color: colors.primary,
      fontWeight: fontWeight.semibold,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    description: {
      fontSize: fontSize.md,
      color: colors.text,
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    date: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    notesInput: {
      minHeight: 100,
    },
    notesReadonly: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    actions: {
      gap: spacing.md,
    },
    actionLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    actionChip: {
      flexGrow: 1,
      minWidth: '30%',
    },
  });

export default StaffComplaintDetailScreen;
