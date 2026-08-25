import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LogistikaMap, DriverMarker } from '../components/map';
import { ordersService } from '../services/ordersService';
import { PublicTrackingShare } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { ScreenBackground } from '../components/ScreenBackground';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';
import { useSmoothDriverLocation } from '../hooks/useSmoothDriverLocation';
import { LOCATION_POST_INTERVAL_MS } from '../services/locationTrackingService';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { regionFromCenter } from '../utils/mapGeo';
import { parseTrackingShareToken } from '../utils/shareTrackingLink';

const POLL_INTERVAL_MS = Math.max(3000, LOCATION_POST_INTERVAL_MS * 3);
const DEFAULT_CENTER = regionFromCenter(41.2995, 69.2401, 0.08);

const ACTIVE_STATUS_CODES = new Set(['in_progress', 'in_transit', 'approved_by_client', 'pending']);

function statusTone(code?: string): 'active' | 'done' | 'neutral' {
  if (!code) {return 'neutral';}
  if (code === 'completed') {return 'done';}
  if (ACTIVE_STATUS_CODES.has(code)) {return 'active';}
  if (code === 'cancelled' || code === 'rejected') {return 'done';}
  return 'neutral';
}

const PublicTrackingShareScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const { isAuthenticated } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const routeParams = (route.params || {}) as { token?: string; url?: string };
  const shareToken = useMemo(
    () => parseTrackingShareToken(routeParams.token || routeParams.url || ''),
    [routeParams.token, routeParams.url],
  );

  const [data, setData] = useState<PublicTrackingShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<'missing' | 'expired' | 'not_found' | 'generic' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const loadInFlightRef = useRef(false);

  const loadShare = useCallback(
    async (silent = false) => {
      if (!shareToken) {
        setErrorKind('missing');
        setData(null);
        setLoading(false);
        return;
      }
      if (loadInFlightRef.current) {return;}

      loadInFlightRef.current = true;
      try {
        if (!silent) {
          setLoading(true);
        }
        setErrorKind(null);
        const payload = await ordersService.getPublicTrackingShare(shareToken);
        setData((previous) => {
          const previousAt = previous?.driver_last_seen_at || previous?.updated_at;
          const payloadAt = payload.driver_last_seen_at || payload.updated_at;
          const previousMs = previousAt ? Date.parse(previousAt) : null;
          const payloadMs = payloadAt ? Date.parse(payloadAt) : null;
          if (
            previous &&
            previousMs != null &&
            payloadMs != null &&
            Number.isFinite(previousMs) &&
            Number.isFinite(payloadMs) &&
            payloadMs < previousMs
          ) {
            return previous;
          }
          return payload;
        });
        setLastRefreshedAt(new Date());
      } catch (error: any) {
        const status = error?.statusCode ?? error?.response?.status;
        if (status === 410) {
          setData(null);
          setErrorKind('expired');
        } else if (status === 404) {
          setData(null);
          setErrorKind('not_found');
        } else if (!silent) {
          setData(null);
          setErrorKind('generic');
        }
      } finally {
        loadInFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [shareToken],
  );

  useEffect(() => {
    void loadShare(false);
  }, [loadShare]);

  useEffect(() => {
    if (!shareToken || errorKind) {
      return undefined;
    }
    const timer = setInterval(() => {
      void loadShare(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shareToken, errorKind, loadShare]);

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    (navigation as any).navigate(isAuthenticated ? 'Main' : 'Auth');
  };

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) {
      return '—';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return typeof value === 'string' ? value : '—';
    }
    const locale = currentLanguage === 'ru' ? 'ru-RU' : currentLanguage === 'en' ? 'en-US' : 'uz-UZ';
    return date.toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusLabel = data?.status_code
    ? t(`tracking.publicShare.status.${data.status_code}`, { defaultValue: data.status_code })
    : '';

  const tone = statusTone(data?.status_code);
  const statusChipStyle =
    tone === 'active' ? styles.statusChip_active : tone === 'done' ? styles.statusChip_done : styles.statusChip_neutral;
  const statusChipTextStyle =
    tone === 'active'
      ? styles.statusChipText_active
      : tone === 'done'
        ? styles.statusChipText_done
        : styles.statusChipText_neutral;

  const serverMotion = useMemo(() => {
    if (data?.current_location?.lat == null || data?.current_location?.lng == null) {
      return null;
    }
    const seenAt = data.driver_last_seen_at
      ? Date.parse(data.driver_last_seen_at)
      : data.updated_at
        ? Date.parse(data.updated_at)
        : Date.now();
    return {
      latitude: data.current_location.lat,
      longitude: data.current_location.lng,
      heading: data.heading ?? null,
      speedMps: data.speed_mps ?? null,
      updatedAtMs: Number.isFinite(seenAt) ? seenAt : Date.now(),
    };
  }, [
    data?.current_location?.lat,
    data?.current_location?.lng,
    data?.heading,
    data?.speed_mps,
    data?.driver_last_seen_at,
    data?.updated_at,
  ]);

  const smoothDriverPoint = useSmoothDriverLocation(serverMotion, true);
  const driverPoint = smoothDriverPoint;
  const driverBearing = data?.heading != null && Number.isFinite(data.heading) ? data.heading : 0;

  const mapRegion = driverPoint
    ? regionFromCenter(driverPoint.latitude, driverPoint.longitude, 0.03, 0.03)
    : DEFAULT_CENTER;

  if (loading && !data) {
    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('tracking.publicShare.title')}
          showBack
          onBack={handleClose}
        />
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (errorKind) {
    const messageKey =
      errorKind === 'expired'
        ? 'tracking.publicShare.expired'
        : errorKind === 'not_found'
          ? 'tracking.publicShare.notFound'
          : errorKind === 'missing'
            ? 'tracking.publicShare.invalidLink'
            : 'tracking.publicShare.loadError';

    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('tracking.publicShare.title')}
          showBack
          onBack={handleClose}
        />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t(messageKey)}
          actionText={
            errorKind === 'missing'
              ? t('tracking.publicShare.openLinkTitle')
              : t('common.retry')
          }
          onActionPress={() => {
            if (errorKind === 'missing') {
              (navigation as any).navigate('OpenTrackingLink');
              return;
            }
            void loadShare(false);
          }}
        />
      </ScreenBackground>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={t('tracking.publicShare.title')}
        subtitle={t('tracking.publicShare.orderLabel', { id: data.order_id })}
        showBack
        onBack={handleClose}
      />

      <View style={styles.content}>
        <View style={styles.mapCard}>
          <LogistikaMap
            style={styles.map}
            region={mapRegion}
            zoomLevel={driverPoint ? 15.8 : undefined}
            heading={driverPoint ? driverBearing : 0}
            pitch={driverPoint ? 40 : 0}
            cameraAnimationMs={0}>
            {driverPoint ? (
              <DriverMarker
                coordinate={driverPoint}
                bearing={driverBearing}
                moving={(data?.speed_mps ?? 0) >= 0.6}
              />
            ) : null}
          </LogistikaMap>
          {!driverPoint ? (
            <View style={styles.mapOverlay}>
              <Text style={styles.mapOverlayText}>{t('tracking.publicShare.noLocation')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('orders.status')}</Text>
            <View style={[styles.statusChip, statusChipStyle]}>
              <Text style={[styles.statusChipText, statusChipTextStyle]}>{statusLabel}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('tracking.publicShare.eta')}</Text>
            <Text style={styles.infoValue}>
              {data.eta_minutes != null
                ? t('tracking.publicShare.etaMinutes', { minutes: data.eta_minutes })
                : t('tracking.publicShare.etaUnknown')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('tracking.lastUpdate')}</Text>
            <Text style={styles.infoValue}>{formatDateTime(data.updated_at)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('tracking.publicShare.expiresAt')}</Text>
            <Text style={styles.infoValue}>{formatDateTime(data.expires_at)}</Text>
          </View>
          {lastRefreshedAt ? (
            <Text style={styles.refreshedHint}>
              {t('tracking.publicShare.lastRefreshed', { time: formatDateTime(lastRefreshedAt) })}
            </Text>
          ) : null}
        </View>

        <Button
          title={t('tracking.publicShare.refresh')}
          onPress={() => {
            setRefreshing(true);
            void loadShare(true);
          }}
          loading={refreshing}
          variant="outline"
        />
        <Text style={styles.hint}>{t('tracking.publicShare.autoRefreshHint')}</Text>
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: spacing.xxxl,
    },
    mapCard: {
      height: 300,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    map: {
      flex: 1,
    },
    mapOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay + '55',
      padding: spacing.lg,
    },
    mapOverlayText: {
      color: colors.text,
      fontSize: fontSize.sm,
      textAlign: 'center',
      fontWeight: fontWeight.semibold,
    },
    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
    },
    infoLabel: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    infoValue: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.text,
      fontWeight: fontWeight.semibold,
      textAlign: 'right',
    },
    statusChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      borderWidth: 1,
    },
    statusChip_active: {
      backgroundColor: colors.primaryGlow,
      borderColor: colors.primary,
    },
    statusChip_done: {
      backgroundColor: colors.backgroundSecondary,
      borderColor: colors.border,
    },
    statusChip_neutral: {
      backgroundColor: colors.warningGlow,
      borderColor: colors.warning,
    },
    statusChipText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      textAlign: 'right',
    },
    statusChipText_active: {
      color: colors.primary,
    },
    statusChipText_done: {
      color: colors.textSecondary,
    },
    statusChipText_neutral: {
      color: colors.warning,
    },
    refreshedHint: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      textAlign: 'right',
    },
    hint: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });

export default PublicTrackingShareScreen;
