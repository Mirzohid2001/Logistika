import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { notificationService } from '../services/notificationService';
import { NotificationPreferences } from '../types';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { ScreenBackground } from '../components/ScreenBackground';
import { AppHeader } from '../components/AppHeader';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { toastService } from '../services/toastService';
import { getApiErrorMessage } from '../services/errorService';
import { NOTIFICATION_TYPE_KEYS } from '../config/notificationTypes';

function SettingRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary + '55' }}
        thumbColor={value ? colors.primary : colors.textTertiary}
      />
    </View>
  );
}

const NotificationSettingsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const typeKeys = React.useMemo(() => {
    if (!prefs?.types) {
      return [...NOTIFICATION_TYPE_KEYS];
    }
    const fromApi = Object.keys(prefs.types);
    const merged = new Set<string>([...NOTIFICATION_TYPE_KEYS, ...fromApi]);
    return Array.from(merged);
  }, [prefs?.types]);

  const loadPreferences = useCallback(async (silent = false) => {
    try {
      if (!silent) {setLoading(true);}
      const data = await notificationService.getPreferences();
      setPrefs(data);
    } catch (error) {
      setPrefs(null);
      toastService.error(getApiErrorMessage(error, t('notificationSettings.loadError')));
    } finally {
      if (!silent) {setLoading(false);}
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadPreferences();
    }, [loadPreferences])
  );

  const patchPreferences = async (
    payload: Parameters<typeof notificationService.updatePreferences>[0],
    key: string
  ) => {
    try {
      setSavingKey(key);
      const updated = await notificationService.updatePreferences(payload);
      setPrefs(updated);
    } catch (error) {
      toastService.error(getApiErrorMessage(error, t('notificationSettings.saveError')));
      await loadPreferences(true);
    } finally {
      setSavingKey(null);
    }
  };

  const updateTypePreference = (
    notificationType: string,
    channel: 'push_enabled' | 'in_app_enabled',
    value: boolean
  ) => {
    if (!prefs) {return;}
    const current = prefs.types[notificationType] || { push_enabled: true, in_app_enabled: true };
    const optimistic: NotificationPreferences = {
      ...prefs,
      types: {
        ...prefs.types,
        [notificationType]: {
          ...current,
          [channel]: value,
        },
      },
    };
    setPrefs(optimistic);
    void patchPreferences(
      {
        types: {
          [notificationType]: {
            [channel]: value,
          },
        },
      },
      `${notificationType}:${channel}`
    );
  };

  const getTypeLabel = (typeKey: string) =>
    t(`notificationSettings.types.${typeKey}`, { defaultValue: typeKey });

  if (loading && !prefs) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!prefs) {
    return (
      <ScreenBackground>
        <AppHeader title={t('notificationSettings.title')} subtitle={t('notificationSettings.byTypeHint')} />
        <EmptyState
          variant="error"
          title={t('notificationSettings.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={() => loadPreferences()}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader title={t('notificationSettings.title')} subtitle={t('notificationSettings.byTypeHint')} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadPreferences(true);
            }}
          />
        }>
        <Card variant="soft" style={styles.card}>
          <Text style={styles.sectionTitle}>{t('notificationSettings.global')}</Text>
          <SettingRow
            label={t('notificationSettings.pushEnabled')}
            description={t('notificationSettings.pushEnabledHint')}
            value={prefs.push_enabled}
            disabled={savingKey === 'global:push'}
            onValueChange={(value) => {
              setPrefs({ ...prefs, push_enabled: value });
              void patchPreferences({ push_enabled: value }, 'global:push');
            }}
          />
          <SettingRow
            label={t('notificationSettings.inAppEnabled')}
            description={t('notificationSettings.inAppEnabledHint')}
            value={prefs.in_app_enabled}
            disabled={savingKey === 'global:in_app'}
            onValueChange={(value) => {
              setPrefs({ ...prefs, in_app_enabled: value });
              void patchPreferences({ in_app_enabled: value }, 'global:in_app');
            }}
          />
        </Card>

        <Card variant="soft" style={styles.card}>
          <Text style={styles.sectionTitle}>{t('notificationSettings.byType')}</Text>
          <Text style={styles.sectionHint}>{t('notificationSettings.byTypeHint')}</Text>
          {typeKeys.map((typeKey) => {
            const typePrefs = prefs.types[typeKey] || { push_enabled: true, in_app_enabled: true };
            return (
              <View key={typeKey} style={styles.typeBlock}>
                <Text style={styles.typeTitle}>{getTypeLabel(typeKey)}</Text>
                <SettingRow
                  label={t('notificationSettings.push')}
                  value={prefs.push_enabled && typePrefs.push_enabled}
                  disabled={!prefs.push_enabled || savingKey === `${typeKey}:push`}
                  onValueChange={(value) => updateTypePreference(typeKey, 'push_enabled', value)}
                />
                <SettingRow
                  label={t('notificationSettings.inApp')}
                  value={prefs.in_app_enabled && typePrefs.in_app_enabled}
                  disabled={!prefs.in_app_enabled || savingKey === `${typeKey}:in_app`}
                  onValueChange={(value) => updateTypePreference(typeKey, 'in_app_enabled', value)}
                />
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  typeBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  typeTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default NotificationSettingsScreen;
