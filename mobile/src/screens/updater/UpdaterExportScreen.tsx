import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { updaterService } from '../../services/updaterService';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AppHeader } from '../../components/AppHeader';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ScreenBackground } from '../../components/ScreenBackground';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';

const UpdaterExportScreen = () => {
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
      const data = await updaterService.exportData({
        format,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      if (format === 'csv' && data.data) {
        Alert.alert(
          t('updaterLists.exportSuccessTitle'),
          t('updaterLists.exportSuccessMessage'),
          [{ text: t('common.ok') }]
        );
      } else {
        Alert.alert(
          t('updaterLists.exportExcelReadyTitle'),
          t('updaterLists.exportExcelReadyMessage'),
          [{ text: t('common.ok') }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.response?.data?.error || t('updaterLists.exportError')
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenBackground>
      <AppHeader
        title={t('dispatcherOps.openExport')}
        subtitle={t('updaterLists.exportSelectFormat')}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('updaterLists.exportSelectFormat')}</Text>
          <View style={styles.formatButtons}>
            <TouchableOpacity
              style={[styles.formatButton, format === 'csv' && styles.formatButtonActive]}
              onPress={() => setFormat('csv')}>
              <MaterialIcons
                name="description"
                size={24}
                color={format === 'csv' ? colors.textLight : colors.textSecondary}
              />
              <Text style={[styles.formatText, format === 'csv' && styles.formatTextActive]}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formatButton, format === 'excel' && styles.formatButtonActive]}
              onPress={() => setFormat('excel')}>
              <MaterialIcons
                name="table-chart"
                size={24}
                color={format === 'excel' ? colors.textLight : colors.textSecondary}
              />
              <Text style={[styles.formatText, format === 'excel' && styles.formatTextActive]}>Excel</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('updaterLists.exportDateRangeOptional')}</Text>
          <Input
            label={t('updaterLists.exportDateFromLabel')}
            value={dateFrom}
            onChangeText={setDateFrom}
            placeholder="2026-01-01"
            style={styles.input}
          />
          <Input
            label={t('updaterLists.exportDateToLabel')}
            value={dateTo}
            onChangeText={setDateTo}
            placeholder="2026-02-11"
            style={styles.input}
          />
        </Card>

        <Card variant="soft" style={styles.infoCard}>
          <MaterialIcons name="info" size={24} color={colors.primary} />
          <Text style={styles.infoText}>{t('updaterLists.exportInfoText')}</Text>
        </Card>

        <Button
          title={t('updaterLists.exportButton', { format: format.toUpperCase() })}
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
    gap: spacing.md,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundTertiary,
    gap: spacing.sm,
  },
  formatButtonActive: {
    backgroundColor: colors.primary,
  },
  formatText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  formatTextActive: {
    color: colors.textLight,
  },
  input: {
    marginBottom: spacing.md,
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
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 20,
  },
  exportButton: {
    marginTop: spacing.sm,
  },
});

export default UpdaterExportScreen;
