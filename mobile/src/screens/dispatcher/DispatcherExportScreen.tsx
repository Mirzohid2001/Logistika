import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { dispatcherService } from '../../services/dispatcherService';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';

const DispatcherExportScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [format, setFormat] = useState<'excel' | 'csv'>('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await dispatcherService.exportData({
        format,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      if (format === 'csv' && data.data) {
        Alert.alert(
          t('dispatcherLists.exportSuccessTitle'),
          t('dispatcherLists.exportSuccessMessage'),
          [{ text: t('common.ok') }]
        );
      } else {
        Alert.alert(
          t('dispatcherLists.exportExcelReadyTitle'),
          t('dispatcherLists.exportExcelReadyMessage'),
          [{ text: t('common.ok') }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.response?.data?.error || t('dispatcherLists.exportError')
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenBackground>
      <AppHeader
        title={t('dispatcherOps.openExport')}
        subtitle={t('dispatcherLists.exportSelectFormat')}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('dispatcherLists.exportSelectFormat')}</Text>
        <View style={styles.formatButtons}>
          <TouchableOpacity
            style={[styles.formatButton, format === 'csv' && styles.formatButtonActive]}
            onPress={() => setFormat('csv')}>
            <MaterialIcons name="description" size={24} color={format === 'csv' ? colors.textLight : colors.textSecondary} />
            <Text style={[styles.formatText, format === 'csv' && styles.formatTextActive]}>
              CSV
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.formatButton, format === 'excel' && styles.formatButtonActive]}
            onPress={() => setFormat('excel')}>
            <MaterialIcons name="table-chart" size={24} color={format === 'excel' ? colors.textLight : colors.textSecondary} />
            <Text style={[styles.formatText, format === 'excel' && styles.formatTextActive]}>
              Excel
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('dispatcherLists.exportDateRangeOptional')}</Text>
        <Input
          label={t('dispatcherLists.exportDateFromLabel')}
          value={dateFrom}
          onChangeText={setDateFrom}
          placeholder="2026-01-01"
          style={styles.input}
        />
        <Input
          label={t('dispatcherLists.exportDateToLabel')}
          value={dateTo}
          onChangeText={setDateTo}
          placeholder="2026-02-11"
          style={styles.input}
        />
      </Card>

      <Card variant="soft" style={styles.infoCard}>
        <MaterialIcons name="info" size={24} color={colors.primary} />
        <Text style={styles.infoText}>
          {t('dispatcherLists.exportInfoText')}
        </Text>
      </Card>

      <Button
        title={t('dispatcherLists.exportButton', { format: format.toUpperCase() })}
        onPress={handleExport}
        loading={exporting}
        variant="primary"
        style={styles.exportButton}
      />
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  formatButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
    gap: 8,
  },
  formatButtonActive: {
    backgroundColor: colors.primary,
  },
  formatText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  formatTextActive: {
    color: colors.textLight,
  },
  input: {
    marginBottom: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.primaryGlow,
    borderRadius: borderRadius.lg,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  exportButton: {
    marginTop: 8,
  },
});

export default DispatcherExportScreen;
