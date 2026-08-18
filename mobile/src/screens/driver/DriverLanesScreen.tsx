import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Geolocation from 'react-native-geolocation-service';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ChipSelect } from '../../components/ChipSelect';
import { Input } from '../../components/Input';
import { ScreenBackground } from '../../components/ScreenBackground';
import { advertisementsService } from '../../services/advertisementsService';
import { locationsService } from '../../services/locationsService';
import { ensureForegroundLocationPermission } from '../../services/locationTrackingService';
import { City, DriverAvailability, DriverLane } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { toastService } from '../../services/toastService';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatHour = (hour: number | null | undefined) => {
  if (hour == null) return null;
  return `${String(hour).padStart(2, '0')}:00`;
};

const DriverLanesScreen = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [lanes, setLanes] = useState<DriverLane[]>([]);
  const [availability, setAvailability] = useState<DriverAvailability | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [uzCountryId, setUzCountryId] = useState<number | null>(null);
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [weekdays, setWeekdays] = useState<string[]>(['1']);
  const [timeFrom, setTimeFrom] = useState('any');
  const [timeTo, setTimeTo] = useState('any');
  const [includeBackhaul, setIncludeBackhaul] = useState(true);
  const [cityQuery, setCityQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const cityLabel = (city: City) =>
    (city as any).name ||
    (city as any).name_uz ||
    (city as any).name_ru ||
    (city as any).name_en ||
    `#${city.id}`;

  const hourOptions = useMemo(
    () => [
      { value: 'any', label: t('matching.lanes.anyTime') },
      ...HOURS.map((hour) => ({ value: String(hour), label: formatHour(hour)! })),
    ],
    [t],
  );

  const load = useCallback(async () => {
    try {
      const [laneData, availabilityData, countries] = await Promise.all([
        advertisementsService.getLanes(),
        advertisementsService.getAvailability(),
        locationsService.getCountries(),
      ]);
      setLanes(laneData.lanes || []);
      setAvailability(availabilityData);
      if (availabilityData?.current_city_id) {
        setCurrentCity(String(availabilityData.current_city_id));
      }
      const country = countries.find((item) => item.code === 'UZ') || countries[0];
      setUzCountryId(country?.id ?? null);
      setCities(country ? await locationsService.getCities(country.id) : []);
    } catch {
      toastService.error(t('matching.lanes.loadError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const saveCurrentCity = async (cityId: string, opts?: { silent?: boolean }) => {
    const previous = currentCity;
    setCurrentCity(cityId);
    try {
      const next = await advertisementsService.updateAvailability({
        current_city: cityId ? Number(cityId) : null,
      });
      setAvailability(next);
      if (cityId && !opts?.silent) {
        toastService.success(t('matching.availability.citySaved'));
      }
      return true;
    } catch {
      setCurrentCity(previous);
      toastService.error(t('matching.availability.citySaveError'));
      return false;
    }
  };

  const detectCityFromGps = async () => {
    if (locating) return;
    try {
      setLocating(true);
      const granted = await ensureForegroundLocationPermission(t);
      if (!granted) {
        return;
      }
      const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        });
      });
      const nearest = await locationsService.getNearestCity(
        position.coords.latitude,
        position.coords.longitude,
        { countryId: uzCountryId || undefined, maxKm: 120 },
      );
      if (!cities.some((city) => city.id === nearest.id)) {
        setCities((prev) => [
          {
            id: nearest.id,
            name: nearest.name,
            name_uz: nearest.name,
            name_ru: nearest.name,
            name_en: nearest.name,
          } as City,
          ...prev,
        ]);
      }
      const saved = await saveCurrentCity(String(nearest.id), { silent: true });
      if (saved) {
        toastService.success(
          t('matching.availability.gpsCityFound', {
            city: nearest.name,
            km: nearest.distance_km,
          }),
        );
      }
    } catch {
      toastService.error(t('matching.availability.gpsError'));
    } finally {
      setLocating(false);
    }
  };

  const addLane = async () => {
    if (!fromCity || !toCity) {
      toastService.error(t('matching.lanes.citiesRequired'));
      return;
    }
    try {
      setSaving(true);
      await advertisementsService.createLane({
        departure_city: Number(fromCity),
        destination_city: Number(toCity),
        weekdays: weekdays.map(Number),
        include_backhaul: includeBackhaul,
        time_from_hour: timeFrom === 'any' ? null : Number(timeFrom),
        time_to_hour: timeTo === 'any' ? null : Number(timeTo),
      });
      setFromCity('');
      setToCity('');
      setTimeFrom('any');
      setTimeTo('any');
      await load();
    } catch (error: any) {
      toastService.error(error?.response?.data?.error || t('matching.lanes.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const cityOptions = (() => {
    const filtered = cities.filter((city) => {
      if (!cityQuery) return true;
      return cityLabel(city).toLowerCase().includes(cityQuery.toLowerCase());
    });
    const selected = currentCity
      ? cities.find((city) => String(city.id) === currentCity)
      : null;
    const merged = selected && !filtered.some((city) => city.id === selected.id)
      ? [selected, ...filtered]
      : filtered;
    return merged.slice(0, 16).map((city) => ({ value: String(city.id), label: cityLabel(city) }));
  })();

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('matching.lanes.title')} subtitle={t('matching.lanes.subtitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card variant="elevated" style={styles.card}>
          <Text style={styles.sectionTitle}>{t('matching.availability.currentCity')}</Text>
          <Text style={styles.hint}>{t('matching.availability.currentCityHint')}</Text>
          {availability?.current_city ? (
            <Text style={styles.currentCity}>{availability.current_city}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={() => void detectCityFromGps()}
            disabled={locating}
            activeOpacity={0.85}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="my-location" size={20} color={colors.primary} />
            )}
            <Text style={styles.gpsBtnText}>{t('matching.availability.useGps')}</Text>
          </TouchableOpacity>
          <Input label={t('common.search')} value={cityQuery} onChangeText={setCityQuery} />
          <ChipSelect options={cityOptions} value={currentCity} onChange={(value) => void saveCurrentCity(value)} />
        </Card>

        <Card variant="elevated" style={styles.card}>
          <Text style={styles.sectionTitle}>{t('matching.lanes.add')}</Text>
          <Text style={styles.label}>{t('matching.lanes.from')}</Text>
          <ChipSelect options={cityOptions} value={fromCity} onChange={setFromCity} />
          <Text style={styles.label}>{t('matching.lanes.to')}</Text>
          <ChipSelect options={cityOptions} value={toCity} onChange={setToCity} />
          <Text style={styles.label}>{t('matching.lanes.weekdays')}</Text>
          <ChipSelect
            multiple
            options={WEEKDAYS.map((day) => ({ value: String(day), label: t(`matching.weekdays.${day}`) }))}
            value={weekdays}
            onChange={setWeekdays}
          />
          <Text style={styles.label}>{t('matching.lanes.timeWindow')}</Text>
          <Text style={styles.hint}>{t('matching.lanes.timeWindowHint')}</Text>
          <Text style={styles.subLabel}>{t('matching.lanes.timeFrom')}</Text>
          <ChipSelect options={hourOptions} value={timeFrom} onChange={(value) => setTimeFrom(value || 'any')} />
          <Text style={styles.subLabel}>{t('matching.lanes.timeTo')}</Text>
          <ChipSelect options={hourOptions} value={timeTo} onChange={(value) => setTimeTo(value || 'any')} />
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIncludeBackhaul((prev) => !prev)}
            activeOpacity={0.85}>
            <MaterialIcons
              name={includeBackhaul ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={includeBackhaul ? colors.primary : colors.textTertiary}
            />
            <Text style={styles.toggleText}>{t('matching.lanes.withBackhaul')}</Text>
          </TouchableOpacity>
          <Button title={t('matching.lanes.add')} onPress={() => void addLane()} loading={saving} />
        </Card>

        {lanes.map((lane) => {
          const days = Array.isArray(lane.weekdays) ? lane.weekdays : [];
          const fromLabel = formatHour(lane.time_from_hour);
          const toLabel = formatHour(lane.time_to_hour);
          const timeLabel =
            fromLabel || toLabel
              ? `${fromLabel || '…'} – ${toLabel || '…'}`
              : t('matching.lanes.anyTime');
          return (
            <Card key={lane.id} variant="soft" style={styles.card}>
              <View style={styles.laneHeader}>
                <Text style={styles.route}>
                  {lane.departure_city || '—'} → {lane.destination_city || '—'}
                </Text>
                {!lane.is_active ? (
                  <Text style={styles.inactive}>{t('matching.lanes.inactive')}</Text>
                ) : null}
              </View>
              <Text style={styles.meta}>
                {days.map((day) => t(`matching.weekdays.${day}`)).join(', ') || t('matching.lanes.anyDay')}
                {' · '}
                {timeLabel}
              </Text>
              <View style={styles.laneActions}>
                <TouchableOpacity
                  style={styles.chipBtn}
                  onPress={async () => {
                    try {
                      await advertisementsService.updateLane(lane.id, {
                        include_backhaul: !lane.include_backhaul,
                      });
                      await load();
                    } catch {
                      toastService.error(t('matching.lanes.saveError'));
                    }
                  }}>
                  <Text style={styles.chipBtnText}>
                    {lane.include_backhaul
                      ? t('matching.lanes.withBackhaul')
                      : t('matching.lanes.withoutBackhaul')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chipBtn}
                  onPress={async () => {
                    try {
                      await advertisementsService.updateLane(lane.id, { is_active: !lane.is_active });
                      await load();
                    } catch {
                      toastService.error(t('matching.lanes.saveError'));
                    }
                  }}>
                  <Text style={styles.chipBtnText}>
                    {lane.is_active ? t('matching.lanes.pause') : t('matching.lanes.resume')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chipBtn, styles.chipDanger]}
                  onPress={async () => {
                    try {
                      await advertisementsService.deleteLane(lane.id);
                      await load();
                    } catch {
                      toastService.error(t('matching.lanes.saveError'));
                    }
                  }}>
                  <Text style={[styles.chipBtnText, { color: colors.danger }]}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: any) => ({
  content: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.xs },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: 2,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  currentCity: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  gpsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    alignSelf: 'flex-start' as const,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  gpsBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  subLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  route: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, flex: 1 },
  meta: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  toggleText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  laneHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  inactive: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: fontWeight.semibold,
  },
  laneActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
  },
  chipBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  chipDanger: {
    borderColor: `${colors.danger}44`,
  },
  chipBtnText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
});

export default DriverLanesScreen;
