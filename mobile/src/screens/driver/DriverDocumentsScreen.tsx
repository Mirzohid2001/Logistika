import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { DriverVerificationBanner } from '../../components/DriverVerificationBanner';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { DriverDocument } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { toastService } from '../../services/toastService';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';

const DOCUMENT_TYPES: Array<{ id: DriverDocument['document_type']; label: string }> = [
  { id: 'passport', label: 'Passport' },
  { id: 'driver_license', label: 'Driver License' },
  { id: 'vehicle_insurance', label: 'Vehicle Insurance' },
  { id: 'tech_inspection', label: 'Tech Inspection' },
  { id: 'permit', label: 'Permit' },
];

const DriverDocumentsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [documentType, setDocumentType] = useState<DriverDocument['document_type']>('driver_license');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDocumentType, setEditDocumentType] = useState<DriverDocument['document_type']>('driver_license');
  const [editDocumentNumber, setEditDocumentNumber] = useState('');
  const [editIssuedAt, setEditIssuedAt] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [pickerTarget, setPickerTarget] = useState<null | 'issued' | 'expires' | 'editIssued' | 'editExpires'>(null);
  const [pickerDate, setPickerDate] = useState(new Date());

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await authService.getDriverDocuments();
      setDocuments(data);
    } catch (error) {
      setDocuments([]);
      setLoadFailed(true);
      toastService.error(t('profile.documentsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments])
  );

  const sortedDocs = useMemo(
    () => {
      const filtered = [...documents].filter((doc) => {
        const daysLeft = getDaysLeft(doc.expires_at);
        if (listFilter === 'active') {
          return doc.is_active && daysLeft >= 0;
        }
        if (listFilter === 'expired') {
          return !doc.is_active || daysLeft < 0;
        }
        return true;
      });
      return filtered.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
    },
    [documents, listFilter]
  );

  const getDaysLeft = (dateIso: string) => {
    const diffMs = new Date(dateIso).getTime() - Date.now();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const getBadgeStyle = (daysLeft: number) => {
    if (daysLeft < 0) {return styles.badgeDanger;}
    if (daysLeft <= 7) {return styles.badgeWarning;}
    return styles.badgeSafe;
  };

  const getBadgeText = (daysLeft: number) => {
    if (daysLeft < 0) {return `${Math.abs(daysLeft)}d ${t('profile.expired')}`;}
    return `${daysLeft}d`;
  };

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateOrToday = (value?: string) => {
    if (!value) {
      return new Date();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const openDatePicker = (target: 'issued' | 'expires' | 'editIssued' | 'editExpires', currentValue: string) => {
    setPickerTarget(target);
    setPickerDate(parseDateOrToday(currentValue));
  };

  const getPickerBounds = () => {
    const today = new Date();
    const maxFuture = new Date(today);
    maxFuture.setFullYear(maxFuture.getFullYear() + 20);

    if (pickerTarget === 'expires' || pickerTarget === 'editExpires') {
      return {
        minimumDate: today,
        maximumDate: maxFuture,
      };
    }
    return {
      minimumDate: undefined as Date | undefined,
      maximumDate: today,
    };
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setPickerTarget(null);
      return;
    }
    const chosen = selectedDate || pickerDate;
    const value = formatDate(chosen);
    if (pickerTarget === 'issued') {
      setIssuedAt(value);
    } else if (pickerTarget === 'expires') {
      setExpiresAt(value);
    } else if (pickerTarget === 'editIssued') {
      setEditIssuedAt(value);
    } else if (pickerTarget === 'editExpires') {
      setEditExpiresAt(value);
    }
    if (Platform.OS === 'android') {
      setPickerTarget(null);
    }
  };

  const handleCreate = async () => {
    if (!expiresAt || expiresAt.length < 10) {
      toastService.error(t('profile.documentsInvalidDate'));
      return;
    }
    try {
      setSubmitting(true);
      await authService.createDriverDocument({
        document_type: documentType,
        document_number: documentNumber || undefined,
        issued_at: issuedAt || undefined,
        expires_at: expiresAt,
      });
      setDocumentNumber('');
      setIssuedAt('');
      setExpiresAt('');
      toastService.success(t('profile.documentsCreated'));
      await refreshUser();
      await loadDocuments();
    } catch (error: any) {
      toastService.error(error?.message || t('profile.documentsCreateError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (doc: DriverDocument) => {
    Alert.alert(t('common.confirm'), t('profile.documentsDeleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await authService.deleteDriverDocument(doc.id);
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
            toastService.success(t('profile.documentsDeleted'));
          } catch (error) {
            toastService.error(t('profile.documentsDeleteError'));
          }
        },
      },
    ]);
  };

  const startEdit = (doc: DriverDocument) => {
    setEditingId(doc.id);
    setEditDocumentType(doc.document_type);
    setEditDocumentNumber(doc.document_number || '');
    setEditIssuedAt(doc.issued_at || '');
    setEditExpiresAt(doc.expires_at || '');
    setEditIsActive(!!doc.is_active);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDocumentType('driver_license');
    setEditDocumentNumber('');
    setEditIssuedAt('');
    setEditExpiresAt('');
    setEditIsActive(true);
  };

  const handleUpdate = async () => {
    if (!editingId) {
      return;
    }
    if (!editExpiresAt || editExpiresAt.length < 10) {
      toastService.error(t('profile.documentsInvalidDate'));
      return;
    }
    try {
      setSubmitting(true);
      const updated = await authService.updateDriverDocument(editingId, {
        document_type: editDocumentType,
        document_number: editDocumentNumber || '',
        issued_at: editIssuedAt || null,
        expires_at: editExpiresAt,
        is_active: editIsActive,
      });
      setDocuments((prev) => prev.map((d) => (d.id === editingId ? updated : d)));
      toastService.success(t('profile.documentsUpdated'));
      await refreshUser();
      cancelEdit();
    } catch (error: any) {
      toastService.error(error?.message || t('profile.documentsUpdateError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('profile.documentCenter')} subtitle={t('profile.documentCenterSubtitle')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadFailed) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('profile.documentCenter')} subtitle={t('profile.documentCenterSubtitle')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('profile.documentsLoadError')}
          actionText={t('common.retry')}
          onActionPress={loadDocuments}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader variant="hero" title={t('profile.documentCenter')} subtitle={t('profile.documentCenterSubtitle')} />
      <DriverVerificationBanner />
      <Card variant="elevated" style={styles.card}>
        <Text style={styles.title}>{t('profile.documentCenter')}</Text>
        <Text style={styles.subtitle}>{t('profile.documentCenterSubtitle')}</Text>

        <Text style={styles.label}>{t('profile.documentType')}</Text>
        <View style={styles.typesWrap}>
          {DOCUMENT_TYPES.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.typeChip, documentType === item.id && styles.typeChipActive]}
              onPress={() => setDocumentType(item.id)}>
              <Text style={[styles.typeChipText, documentType === item.id && styles.typeChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label={t('profile.documentNumber')}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="Optional"
        />
        <Text style={styles.label}>{t('profile.issuedAt')}</Text>
        <TouchableOpacity style={styles.dateField} onPress={() => openDatePicker('issued', issuedAt)}>
          <Text style={styles.dateFieldText}>{issuedAt || 'YYYY-MM-DD'}</Text>
        </TouchableOpacity>
        <Text style={styles.label}>{t('profile.expiresAt')}</Text>
        <TouchableOpacity style={styles.dateField} onPress={() => openDatePicker('expires', expiresAt)}>
          <Text style={styles.dateFieldText}>{expiresAt || 'YYYY-MM-DD'}</Text>
        </TouchableOpacity>

        <Button title={t('common.add')} onPress={handleCreate} loading={submitting} />
      </Card>

      <Card variant="soft" style={styles.card}>
        <Text style={styles.title}>{t('profile.myDocuments')}</Text>
        <View style={styles.filterWrap}>
          {(['all', 'active', 'expired'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, listFilter === filter && styles.filterChipActive]}
              onPress={() => setListFilter(filter)}>
              <Text style={[styles.filterChipText, listFilter === filter && styles.filterChipTextActive]}>
                {filter === 'all'
                  ? t('common.all')
                  : filter === 'active'
                  ? t('profile.active')
                  : t('profile.expired')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {sortedDocs.length === 0 ? (
          <Text style={styles.empty}>{t('profile.noDocuments')}</Text>
        ) : (
          sortedDocs.map((doc) => {
            const daysLeft = getDaysLeft(doc.expires_at);
            const isEditing = editingId === doc.id;
            return (
              <View key={doc.id} style={styles.docRow}>
                {isEditing ? (
                  <View style={styles.editWrap}>
                    <Text style={styles.label}>{t('profile.documentType')}</Text>
                    <View style={styles.typesWrap}>
                      {DOCUMENT_TYPES.map((item) => (
                        <TouchableOpacity
                          key={`edit-${doc.id}-${item.id}`}
                          style={[styles.typeChip, editDocumentType === item.id && styles.typeChipActive]}
                          onPress={() => setEditDocumentType(item.id)}>
                          <Text
                            style={[
                              styles.typeChipText,
                              editDocumentType === item.id && styles.typeChipTextActive,
                            ]}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Input
                      label={t('profile.documentNumber')}
                      value={editDocumentNumber}
                      onChangeText={setEditDocumentNumber}
                      placeholder="Optional"
                    />
                    <Text style={styles.label}>{t('profile.issuedAt')}</Text>
                    <TouchableOpacity style={styles.dateField} onPress={() => openDatePicker('editIssued', editIssuedAt)}>
                      <Text style={styles.dateFieldText}>{editIssuedAt || 'YYYY-MM-DD'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.label}>{t('profile.expiresAt')}</Text>
                    <TouchableOpacity style={styles.dateField} onPress={() => openDatePicker('editExpires', editExpiresAt)}>
                      <Text style={styles.dateFieldText}>{editExpiresAt || 'YYYY-MM-DD'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleRow, editIsActive ? styles.toggleActive : styles.toggleInactive]}
                      onPress={() => setEditIsActive((prev) => !prev)}>
                      <Text style={styles.toggleText}>
                        {t('profile.isActive')}: {editIsActive ? t('common.yes') : t('common.no')}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.rowActions}>
                      <Button
                        title={t('common.save')}
                        onPress={handleUpdate}
                        loading={submitting}
                        style={styles.actionBtn}
                      />
                      <Button
                        title={t('common.cancel')}
                        onPress={cancelEdit}
                        variant="outline"
                        style={styles.actionBtn}
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.docMain}>
                      <Text style={styles.docName}>{doc.document_type_name || doc.document_type}</Text>
                      <Text style={styles.docMeta}>
                        {t('profile.expiresAt')}: {doc.expires_at}
                      </Text>
                      {!!doc.document_number && (
                        <Text style={styles.docMeta}>
                          {t('profile.documentNumber')}: {doc.document_number}
                        </Text>
                      )}
                      {!!doc.issued_at && (
                        <Text style={styles.docMeta}>
                          {t('profile.issuedAt')}: {doc.issued_at}
                        </Text>
                      )}
                      <Text style={styles.docMeta}>
                        {t('profile.isActive')}: {doc.is_active ? t('common.yes') : t('common.no')}
                      </Text>
                    </View>
                    <View style={styles.docActions}>
                      <View style={[styles.badge, getBadgeStyle(daysLeft)]}>
                        <Text style={styles.badgeText}>{getBadgeText(daysLeft)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => startEdit(doc)}>
                        <Text style={styles.editText}>{t('common.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(doc)}>
                        <Text style={styles.deleteText}>{t('common.delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
      </Card>
      {pickerTarget !== null && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            mode="date"
            value={pickerDate}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={getPickerBounds().minimumDate}
            maximumDate={getPickerBounds().maximumDate}
            onChange={handleDateChange}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setPickerTarget(null)}>
              <Text style={styles.pickerDoneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl + 24 },
  card: { marginBottom: spacing.lg },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  filterWrap: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterChipActive: { backgroundColor: colors.primaryGlow, borderColor: colors.primary },
  filterChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary },
  filterChipTextActive: { color: colors.primary },
  label: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.semibold, marginBottom: spacing.sm },
  dateField: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  dateFieldText: { color: colors.text, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  typesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceMuted,
  },
  typeChipActive: { backgroundColor: colors.primaryGlow, borderColor: colors.primary },
  typeChipText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  typeChipTextActive: { color: colors.primary },
  empty: { color: colors.textTertiary, fontSize: fontSize.sm },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: spacing.md,
  },
  docMain: { flex: 1, paddingRight: spacing.md },
  docActions: { alignItems: 'flex-end', gap: spacing.sm },
  editWrap: { flex: 1 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1, marginBottom: 0 },
  toggleRow: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  toggleActive: { backgroundColor: colors.successGlow, borderColor: `${colors.success}66` },
  toggleInactive: { backgroundColor: colors.dangerGlow, borderColor: `${colors.danger}66` },
  toggleText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  pickerWrap: {
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  pickerDoneBtn: { alignSelf: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pickerDoneText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
  docName: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.text },
  docMeta: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  badge: { borderRadius: borderRadius.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { color: colors.textLight, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  badgeSafe: { backgroundColor: colors.success },
  badgeWarning: { backgroundColor: colors.warning },
  badgeDanger: { backgroundColor: colors.danger },
  editText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  deleteText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
});

export default DriverDocumentsScreen;
