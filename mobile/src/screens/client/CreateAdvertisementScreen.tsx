import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { advertisementsService } from '../../services/advertisementsService';
import { locationsService } from '../../services/locationsService';
import { Country, City, RouteHealthInsight, DuplicateRiskInsight } from '../../types';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { Card } from '../../components/Card';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { toastService } from '../../services/toastService';
import { PriceInsightCard } from '../../components/PriceInsightCard';
import { MapPointPicker, type MapPointPickerRef } from '../../components/map/MapPointPicker';
import { regionFromCenter, type MapRegion } from '../../utils/mapGeo';
import { reverseGeocodeAddress, geocodeAddress, cityFallbackCoordinate } from '../../utils/orderRoute';
import Geolocation from 'react-native-geolocation-service';
import { getMediaUrl } from '../../services/api';
import { promptMarketplaceGateError } from '../../utils/marketplaceGate';

const COORDS_IN_ADDRESS_RE = /\((-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\)\s*$/;

function parseCoordsFromAddress(address: string): { latitude: number; longitude: number } | null {
  const match = COORDS_IN_ADDRESS_RE.exec(address || '');
  if (!match) {return null;}
  const latitude = parseFloat(match[1]);
  const longitude = parseFloat(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {return null;}
  return { latitude, longitude };
}

type IntermediateStop = {
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  mapRegion?: MapRegion;
};

const DEFAULT_MAP_REGION = regionFromCenter(41.2995, 69.2401, 0.08, 0.08);

const CARGO_CATEGORIES = [
  { value: 'general' },
  { value: 'furniture' },
  { value: 'food' },
  { value: 'electronics' },
  { value: 'construction' },
  { value: 'documents' },
  { value: 'fragile' },
  { value: 'other' },
] as const;

const ROUTE_PREFERENCES = [
  { value: 'balanced' },
  { value: 'fastest' },
  { value: 'cheapest' },
  { value: 'no_toll' },
] as const;

const SPECIAL_REQUIREMENTS = [
  { value: 'refrigerated' },
  { value: 'loader_needed' },
  { value: 'dangerous' },
  { value: 'fragile' },
] as const;

const CreateAdvertisementScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = (route.params || {}) as { id?: number; mode?: 'edit' };
  const editId = routeParams.mode === 'edit' ? routeParams.id : undefined;
  const isEditMode = typeof editId === 'number';
  const { t, currentLanguage } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationsLoadFailed, setLocationsLoadFailed] = useState(false);

  // Form fields
  const [photo, setPhoto] = useState<any>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [titleRu, setTitleRu] = useState('');
  const [descriptionRu, setDescriptionRu] = useState('');
  const [proposedCost, setProposedCost] = useState('');
  const [weight, setWeight] = useState('');
  const [volumeM3, setVolumeM3] = useState('');
  const [unitsCount, setUnitsCount] = useState('');
  const [cargoCategory, setCargoCategory] = useState<(typeof CARGO_CATEGORIES)[number]['value']>('general');
  const [routePreference, setRoutePreference] = useState<(typeof ROUTE_PREFERENCES)[number]['value']>('balanced');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [pickupWindowStart, setPickupWindowStart] = useState('');
  const [pickupWindowEnd, setPickupWindowEnd] = useState('');
  const [deliveryDeadline, setDeliveryDeadline] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState<string[]>([]);
  const [requiredBodyType, setRequiredBodyType] = useState('');
  const [isHeavy, setIsHeavy] = useState(false);
  const [departureAddress, setDepartureAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [intermediateStops, setIntermediateStops] = useState<IntermediateStop[]>([]);
  const [stopGpsLoadingIndex, setStopGpsLoadingIndex] = useState<number | null>(null);
  const [stopAddressResolvingIndex, setStopAddressResolvingIndex] = useState<number | null>(null);
  const stopMapRefs = useRef<Record<number, MapPointPickerRef | null>>({});

  // Locations
  const [countries, setCountries] = useState<Country[]>([]);
  const [citiesCache, setCitiesCache] = useState<Record<number, City[]>>({});
  const [loadingCountryCities, setLoadingCountryCities] = useState<number | null>(null);
  const [selectedDepartureCountry, setSelectedDepartureCountry] = useState<number | null>(null);
  const [selectedDepartureCity, setSelectedDepartureCity] = useState<number | null>(null);
  const [selectedDestinationCountry, setSelectedDestinationCountry] = useState<number | null>(null);
  const [selectedDestinationCity, setSelectedDestinationCity] = useState<number | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationModalMode, setLocationModalMode] = useState<
    'departure-country' | 'departure-city' | 'destination-country' | 'destination-city' | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickerTarget, setPickerTarget] = useState<null | 'pickupStart' | 'pickupEnd' | 'deadline'>(null);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [departureMapRegion, setDepartureMapRegion] = useState<MapRegion>(
    regionFromCenter(41.2995, 69.2401, 0.08, 0.08),
  );
  const [destinationMapRegion, setDestinationMapRegion] = useState<MapRegion>(
    regionFromCenter(41.2995, 69.2401, 0.08, 0.08),
  );
  const [addressResolvingTarget, setAddressResolvingTarget] = useState<null | 'departure' | 'destination'>(null);
  const [mapGestureActive, setMapGestureActive] = useState(false);
  const departureMapRef = useRef<MapPointPickerRef>(null);
  const destinationMapRef = useRef<MapPointPickerRef>(null);
  const [routeHealth, setRouteHealth] = useState<RouteHealthInsight | null>(null);
  const [duplicateRisk, setDuplicateRisk] = useState<DuplicateRiskInsight | null>(null);
  const [marketInsightLoading, setMarketInsightLoading] = useState(false);

  const getCityCountryId = (city: City): number | null => {
    const country = (city as any).country;
    if (typeof country === 'number') {
      return country;
    }
    if (country && typeof country === 'object' && typeof country.id === 'number') {
      return country.id;
    }
    return null;
  };

  const toIsoLocal = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    const h = `${date.getHours()}`.padStart(2, '0');
    const min = `${date.getMinutes()}`.padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:00`;
  };

  const parseIsoOrNow = (value?: string) => {
    if (!value) {return new Date();}
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const formatDisplayDate = (value?: string) => {
    if (!value) {return '';}
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {return '';}
    return parsed.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openDateTimePicker = (target: 'pickupStart' | 'pickupEnd' | 'deadline', current: string) => {
    setPickerTarget(target);
    setPickerDate(parseIsoOrNow(current));
  };

  const applyPickedDate = (dateValue: Date) => {
    const value = toIsoLocal(dateValue);
    if (pickerTarget === 'pickupStart') {setPickupWindowStart(value);}
    if (pickerTarget === 'pickupEnd') {setPickupWindowEnd(value);}
    if (pickerTarget === 'deadline') {setDeliveryDeadline(value);}
  };

  const handleDateTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setPickerTarget(null);
      return;
    }
    const nextDate = selectedDate || pickerDate;
    setPickerDate(nextDate);
    if (Platform.OS === 'android') {
      applyPickedDate(nextDate);
      setPickerTarget(null);
    }
  };

  const toggleRequirement = (value: string) => {
    setSpecialRequirements((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const getCargoCategoryLabel = (value: (typeof CARGO_CATEGORIES)[number]['value']) =>
    t(`advertisementsCreate.cargoCategory.${value}`);

  const getRoutePreferenceLabel = (value: (typeof ROUTE_PREFERENCES)[number]['value']) =>
    t(`advertisementsCreate.routePreference.${value}`);

  const getSpecialRequirementLabel = (value: string) =>
    t(`advertisementsCreate.specialRequirements.${value}`);

  useEffect(() => {
    loadCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const departureCities = useMemo(
    () => (selectedDepartureCountry ? citiesCache[selectedDepartureCountry] ?? [] : []),
    [citiesCache, selectedDepartureCountry],
  );

  const destinationCities = useMemo(
    () => (selectedDestinationCountry ? citiesCache[selectedDestinationCountry] ?? [] : []),
    [citiesCache, selectedDestinationCountry],
  );

  useEffect(() => {
    if (!selectedDepartureCountry) {
      setSelectedDepartureCity(null);
      return;
    }
    // Wait until cities are loaded — do not clear a pending edit selection.
    if (departureCities.length === 0) {
      return;
    }
    const hasSelectedDepartureCity = departureCities.some((city) => city.id === selectedDepartureCity);
    if (!hasSelectedDepartureCity) {
      // Prefer leaving destination different from departure when auto-picking.
      const preferred =
        selectedDestinationCity != null
          ? departureCities.find((city) => city.id !== selectedDestinationCity)
          : undefined;
      setSelectedDepartureCity((preferred || departureCities[0]).id);
    }
  }, [selectedDepartureCountry, departureCities, selectedDepartureCity, selectedDestinationCity]);

  useEffect(() => {
    if (!selectedDestinationCountry) {
      setSelectedDestinationCity(null);
      return;
    }
    if (destinationCities.length === 0) {
      return;
    }
    const hasSelectedDestinationCity = destinationCities.some((city) => city.id === selectedDestinationCity);
    if (!hasSelectedDestinationCity) {
      const preferred =
        selectedDepartureCity != null
          ? destinationCities.find((city) => city.id !== selectedDepartureCity)
          : undefined;
      setSelectedDestinationCity((preferred || destinationCities[0]).id);
    }
  }, [selectedDestinationCountry, destinationCities, selectedDestinationCity, selectedDepartureCity]);

  const loadCountries = async () => {
    try {
      setLoadingLocations(true);
      setLocationsLoadFailed(false);
      const data = await locationsService.getCountries();
      setCountries(data);
      if (data.length > 0) {
        const uzbekistan = data.find((c) => c.code === 'UZ' || c.name.toLowerCase().includes('uzbek'));
        const defaultCountry = uzbekistan || data[0];
        setSelectedDepartureCountry(defaultCountry.id);
        setSelectedDestinationCountry(defaultCountry.id);
      } else {
        setLocationsLoadFailed(true);
      }
    } catch (error) {
      console.error('Error loading countries:', error);
      setLocationsLoadFailed(true);
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.countriesLoadFailed'));
    } finally {
      setLoadingLocations(false);
    }
  };

  const loadCitiesForCountry = useCallback(
    async (countryId: number, search?: string) => {
      try {
        setLoadingCountryCities(countryId);
        const data = await locationsService.getCities(countryId, search);
        // Search results are for modal only — don't overwrite the full country cache.
        if (!search?.trim()) {
          setCitiesCache((prev) => ({ ...prev, [countryId]: data }));
        }
        return data;
      } catch (error) {
        console.error('Error loading cities:', error);
        if (!search?.trim()) {
          Alert.alert(t('common.error'), t('advertisementsCreate.errors.citiesLoadFailed'));
        }
        return [];
      } finally {
        setLoadingCountryCities(null);
      }
    },
    [t],
  );

  useEffect(() => {
    if (selectedDepartureCountry) {
      void loadCitiesForCountry(selectedDepartureCountry);
    }
  }, [selectedDepartureCountry, loadCitiesForCountry]);

  useEffect(() => {
    if (selectedDestinationCountry) {
      void loadCitiesForCountry(selectedDestinationCountry);
    }
  }, [selectedDestinationCountry, loadCitiesForCountry]);

  const loadAdvertisementForEdit = useCallback(async () => {
    if (!editId) {
      return;
    }
    try {
      setLoading(true);
      const ad = await advertisementsService.getAdvertisement(editId);
      const title = ad.title || '';
      setTitleRu(title);
      setDescriptionRu(ad.description || '');
      setProposedCost(ad.proposed_cost?.toString() || '');
      setWeight(ad.weight?.toString() || '');
      setVolumeM3(ad.volume_m3?.toString() || '');
      setUnitsCount(ad.units_count?.toString() || '');
      setCargoCategory((ad.cargo_category as (typeof CARGO_CATEGORIES)[number]['value']) || 'general');
      setRoutePreference((ad.route_preference as (typeof ROUTE_PREFERENCES)[number]['value']) || 'balanced');
      setContactName(ad.contact_name || '');
      setContactPhone(ad.contact_phone || '');
      setReceiverName(ad.receiver_name || '');
      setReceiverPhone(ad.receiver_phone || '');
      setSpecialRequirements((ad.special_requirements as (typeof SPECIAL_REQUIREMENTS)[number]['value'][]) || []);
      setRequiredBodyType(ad.required_body_type || '');
      setIsHeavy(Boolean(ad.is_heavy));
      const depAddress = ad.departure_address || '';
      const destAddress = ad.destination_address || '';
      setDepartureAddress(depAddress);
      setDestinationAddress(destAddress);
      setPickupWindowStart(ad.pickup_window_start || '');
      setPickupWindowEnd(ad.pickup_window_end || '');
      setDeliveryDeadline(ad.delivery_deadline || '');
      setExistingPhotoUrl(ad.photo ? getMediaUrl(ad.photo) || ad.photo : null);
      setPhoto(null);

      const plannedStops = Array.isArray(ad.route_stops) ? [...ad.route_stops] : [];
      const sortedStops = plannedStops.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      const endpointPickup = sortedStops[0];
      const endpointDelivery = sortedStops.length > 1 ? sortedStops[sortedStops.length - 1] : null;

      const depCoords =
        parseCoordsFromAddress(depAddress) ||
        (endpointPickup?.lat != null && endpointPickup?.lng != null
          ? { latitude: Number(endpointPickup.lat), longitude: Number(endpointPickup.lng) }
          : null);
      const destCoords =
        parseCoordsFromAddress(destAddress) ||
        (endpointDelivery?.lat != null && endpointDelivery?.lng != null
          ? { latitude: Number(endpointDelivery.lat), longitude: Number(endpointDelivery.lng) }
          : null);
      if (depCoords) {
        setDepartureMapRegion(regionFromCenter(depCoords.latitude, depCoords.longitude, 0.045, 0.045));
      }
      if (destCoords) {
        setDestinationMapRegion(regionFromCenter(destCoords.latitude, destCoords.longitude, 0.045, 0.045));
      }
      const depCity = ad.departure_city;
      const destCity = ad.destination_city;
      if (typeof depCity === 'object' && depCity) {
        const countryId = getCityCountryId(depCity);
        if (countryId) {
          setSelectedDepartureCountry(countryId);
        }
        setSelectedDepartureCity(depCity.id);
        if (!depCoords && depCity.name) {
          const coords = cityFallbackCoordinate(depCity.name);
          if (coords) {
            setDepartureMapRegion(regionFromCenter(coords.latitude, coords.longitude, 0.045, 0.045));
          }
        }
      } else if (typeof depCity === 'number') {
        setSelectedDepartureCity(depCity);
      }
      if (typeof destCity === 'object' && destCity) {
        const countryId = getCityCountryId(destCity);
        if (countryId) {
          setSelectedDestinationCountry(countryId);
        }
        setSelectedDestinationCity(destCity.id);
        if (!destCoords && destCity.name) {
          const coords = cityFallbackCoordinate(destCity.name);
          if (coords) {
            setDestinationMapRegion(regionFromCenter(coords.latitude, coords.longitude, 0.045, 0.045));
          }
        }
      } else if (typeof destCity === 'number') {
        setSelectedDestinationCity(destCity);
      }

      if (sortedStops.length > 2) {
        const middle = sortedStops.slice(1, -1).map((stop) => {
          const parsed = parseCoordsFromAddress(String(stop.address || ''));
          const lat = stop.lat != null ? Number(stop.lat) : parsed?.latitude ?? null;
          const lng = stop.lng != null ? Number(stop.lng) : parsed?.longitude ?? null;
          return {
            label: String(stop.label || ''),
            address: String(stop.address || ''),
            lat,
            lng,
            mapRegion:
              lat != null && lng != null
                ? regionFromCenter(lat, lng, 0.045, 0.045)
                : DEFAULT_MAP_REGION,
          };
        });
        setIntermediateStops(middle);
      } else {
        setIntermediateStops([]);
      }
    } catch (error) {
      console.error('Error loading advertisement for edit:', error);
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.loadFailed'));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [editId, navigation, t]);

  useEffect(() => {
    if (isEditMode && !loadingLocations && countries.length > 0) {
      loadAdvertisementForEdit();
    }
  }, [isEditMode, loadingLocations, countries.length, loadAdvertisementForEdit]);

  const isCountryCitiesLoading = (countryId: number | null) =>
    countryId != null && loadingCountryCities === countryId;

  const centerMapOnCity = useCallback(async (cityName: string, kind: 'departure' | 'destination') => {
    const coords = cityFallbackCoordinate(cityName) ?? (await geocodeAddress(cityName, ''));
    if (!coords) {
      return;
    }
    const region = regionFromCenter(coords.latitude, coords.longitude, 0.045, 0.045);
    if (kind === 'departure') {
      setDepartureMapRegion(region);
    } else {
      setDestinationMapRegion(region);
    }
  }, []);

  useEffect(() => {
    const fromCity = selectedDepartureCity;
    const toCity = selectedDestinationCity;
    if (!fromCity || !toCity || fromCity === toCity) {
      setRouteHealth(null);
      setDuplicateRisk(null);
      return;
    }

    const parsedWeight = parseFloat(weight);
    const parsedCost = parseFloat(proposedCost);
    const payload: { from_city: number; to_city: number; weight?: number; proposed_cost?: number } = {
      from_city: fromCity,
      to_city: toCity,
    };
    if (Number.isFinite(parsedWeight) && parsedWeight > 0) {payload.weight = parsedWeight;}
    if (Number.isFinite(parsedCost) && parsedCost > 0) {payload.proposed_cost = parsedCost;}

    const timer = setTimeout(async () => {
      try {
        setMarketInsightLoading(true);
        const [health, duplicate] = await Promise.all([
          advertisementsService.getRouteHealth(payload),
          advertisementsService.getDuplicateRisk(payload),
        ]);
        setRouteHealth(health);
        setDuplicateRisk(duplicate);
      } catch {
        setRouteHealth(null);
        setDuplicateRisk(null);
      } finally {
        setMarketInsightLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [selectedDepartureCity, selectedDestinationCity, weight, proposedCost]);

  const openCountrySelection = (isDeparture: boolean) => {
    setLocationModalMode(isDeparture ? 'departure-country' : 'destination-country');
    setSearchQuery('');
    setLocationModalVisible(true);
  };

  const openCitySelection = (isDeparture: boolean) => {
    const countryId = isDeparture ? selectedDepartureCountry : selectedDestinationCountry;
    if (!countryId) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.selectCountryFirst'));
      return;
    }
    const cities = isDeparture ? departureCities : destinationCities;
    if (cities.length === 0) {
      if (isCountryCitiesLoading(countryId)) {
        Alert.alert(t('common.loading'), t('advertisementsCreate.loadingCities'));
      } else {
        Alert.alert(t('common.error'), t('advertisementsCreate.errors.noCitiesForCountry'));
      }
      return;
    }
    setLocationModalMode(isDeparture ? 'departure-city' : 'destination-city');
    setSearchQuery('');
    setLocationModalVisible(true);
  };

  const handleSelectLocation = (id: number) => {
    if (!locationModalMode) {
      return;
    }

    if (locationModalMode === 'departure-country') {
      setSelectedDepartureCountry(id);
      setSelectedDepartureCity(null);
    } else if (locationModalMode === 'destination-country') {
      setSelectedDestinationCountry(id);
      setSelectedDestinationCity(null);
    } else if (locationModalMode === 'departure-city') {
      setSelectedDepartureCity(id);
      const city = departureCities.find((item) => item.id === id);
      if (city?.name) {
        void centerMapOnCity(city.name, 'departure');
      }
    } else if (locationModalMode === 'destination-city') {
      setSelectedDestinationCity(id);
      const city = destinationCities.find((item) => item.id === id);
      if (city?.name) {
        void centerMapOnCity(city.name, 'destination');
      }
    }

    setSearchQuery('');
    setLocationModalVisible(false);
  };

  const getFilteredItems = () => {
    let items: (Country | City)[] = [];
    if (locationModalMode === 'departure-country' || locationModalMode === 'destination-country') {
      items = countries;
    } else if (locationModalMode === 'departure-city') {
      items = departureCities;
    } else if (locationModalMode === 'destination-city') {
      items = destinationCities;
    }

    if (searchQuery.trim()) {
      return items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return items;
  };

  const handlePickImage = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
      },
      (response: ImagePickerResponse) => {
        if (response.assets && response.assets[0]) {
          setPhoto({
            uri: response.assets[0].uri!,
            type: response.assets[0].type || 'image/jpeg',
            fileName: response.assets[0].fileName || 'photo.jpg',
          });
        }
      }
    );
  };

  const formatCoordinateAddress = (latitude: number, longitude: number) =>
    `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  const withCoordsSuffix = (address: string, latitude: number, longitude: number) => {
    const coords = formatCoordinateAddress(latitude, longitude);
    if (address.includes(coords)) {return address;}
    return `${address.trim()} (${coords})`;
  };

  const insertMapAddress = async (kind: 'departure' | 'destination') => {
    if (addressResolvingTarget) {return;}
    setAddressResolvingTarget(kind);
    try {
      const mapRef = kind === 'departure' ? departureMapRef : destinationMapRef;
      const region = (await mapRef.current?.getRegion()) ??
        (kind === 'departure' ? departureMapRegion : destinationMapRegion);
      const cities = kind === 'departure' ? departureCities : destinationCities;
      const cityId = kind === 'departure' ? selectedDepartureCity : selectedDestinationCity;
      const coords = formatCoordinateAddress(region.latitude, region.longitude);
      const cityName = cities.find((c) => c.id === cityId)?.name || '';
      const resolvedAddress = await reverseGeocodeAddress(region.latitude, region.longitude, cityName);
      const finalAddress = withCoordsSuffix(resolvedAddress || coords, region.latitude, region.longitude);
      if (kind === 'departure') {
        setDepartureMapRegion(region);
        setDepartureAddress(finalAddress);
      } else {
        setDestinationMapRegion(region);
        setDestinationAddress(finalAddress);
      }
      if (!resolvedAddress) {
        toastService.info(t('advertisementsCreate.map.coordsOnly'));
      }
    } finally {
      setAddressResolvingTarget(null);
    }
  };

  const resolveStopCoords = (stop: IntermediateStop) => {
    if (stop.lat != null && stop.lng != null && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
      return { latitude: stop.lat, longitude: stop.lng };
    }
    return parseCoordsFromAddress(stop.address);
  };

  const fillStopGps = async (index: number) => {
    try {
      setStopGpsLoadingIndex(index);
      const granted = await Geolocation.requestAuthorization('whenInUse');
      if (granted !== 'granted') {
        Alert.alert(t('chat.permissionRequiredTitle'), t('chat.locationPermissionRequired'));
        return;
      }
      const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });
      const { latitude, longitude } = position.coords;
      setIntermediateStops((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) {
          return prev;
        }
        const bareAddress = current.address.replace(COORDS_IN_ADDRESS_RE, '').trim();
        next[index] = {
          ...current,
          lat: latitude,
          lng: longitude,
          address: withCoordsSuffix(bareAddress || formatCoordinateAddress(latitude, longitude), latitude, longitude),
        };
        return next;
      });
    } catch {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.stopGpsFailed'));
    } finally {
      setStopGpsLoadingIndex(null);
    }
  };

  const insertStopMapAddress = async (index: number) => {
    if (stopAddressResolvingIndex != null) {
      return;
    }
    setStopAddressResolvingIndex(index);
    try {
      const mapRef = stopMapRefs.current[index];
      const currentStop = intermediateStops[index];
      const region =
        (await mapRef?.getRegion()) ?? currentStop?.mapRegion ?? DEFAULT_MAP_REGION;
      const cities = departureCities.length ? departureCities : destinationCities;
      const cityId = selectedDepartureCity ?? selectedDestinationCity;
      const coords = formatCoordinateAddress(region.latitude, region.longitude);
      const cityName = cities.find((c) => c.id === cityId)?.name || '';
      const resolvedAddress = await reverseGeocodeAddress(region.latitude, region.longitude, cityName);
      const finalAddress = withCoordsSuffix(resolvedAddress || coords, region.latitude, region.longitude);
      setIntermediateStops((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) {
          return prev;
        }
        next[index] = {
          ...current,
          address: finalAddress,
          lat: region.latitude,
          lng: region.longitude,
          mapRegion: region,
        };
        return next;
      });
      if (!resolvedAddress) {
        toastService.info(t('advertisementsCreate.map.coordsOnly'));
      }
    } finally {
      setStopAddressResolvingIndex(null);
    }
  };

  const applyStopAddressCoords = (index: number) => {
    const current = intermediateStops[index];
    if (!current) {
      return;
    }
    const parsed = parseCoordsFromAddress(current.address);
    if (!parsed) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.stopCoordsMissing'));
      return;
    }
    const next = [...intermediateStops];
    next[index] = {
      ...current,
      lat: parsed.latitude,
      lng: parsed.longitude,
      address: withCoordsSuffix(
        current.address.replace(COORDS_IN_ADDRESS_RE, '').trim() || current.address,
        parsed.latitude,
        parsed.longitude,
      ),
    };
    setIntermediateStops(next);
  };

  const handleSubmit = async () => {
    if (loading) {
      return;
    }

    const normalizedTitle = titleRu.trim();
    const normalizedDescription = descriptionRu.trim();
    const normalizedDepartureAddress = departureAddress.trim();
    const normalizedDestinationAddress = destinationAddress.trim();
    const parsedWeight = parseFloat(weight);
    const parsedCost = proposedCost ? parseFloat(proposedCost) : undefined;
    const parsedVolume = volumeM3 ? parseFloat(volumeM3) : undefined;
    const parsedUnits = unitsCount ? parseInt(unitsCount, 10) : undefined;

    if (!normalizedTitle || !normalizedDescription || !weight || !normalizedDepartureAddress || !normalizedDestinationAddress) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.fillRequiredFields'));
      return;
    }

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.weightInvalid'));
      return;
    }

    if (parsedCost !== undefined && (isNaN(parsedCost) || parsedCost <= 0)) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.costInvalid'));
      return;
    }
    if (parsedVolume !== undefined && (isNaN(parsedVolume) || parsedVolume <= 0)) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.volumeInvalid'));
      return;
    }
    if (parsedUnits !== undefined && (isNaN(parsedUnits) || parsedUnits <= 0)) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.unitsInvalid'));
      return;
    }

    if (!selectedDepartureCity || !selectedDestinationCity) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.selectCities'));
      return;
    }

    if (selectedDepartureCity === selectedDestinationCity) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.citiesCannotMatch'));
      return;
    }

    if (pickupWindowStart && pickupWindowEnd) {
      const start = new Date(pickupWindowStart).getTime();
      const end = new Date(pickupWindowEnd).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        Alert.alert(t('common.error'), t('advertisementsCreate.errors.pickupWindowInvalid'));
        return;
      }
    }

    if (deliveryDeadline && pickupWindowStart) {
      const deadline = new Date(deliveryDeadline).getTime();
      const start = new Date(pickupWindowStart).getTime();
      if (Number.isFinite(deadline) && Number.isFinite(start) && deadline <= start) {
        Alert.alert(t('common.error'), t('advertisementsCreate.errors.deadlineMustBeAfterPickup'));
        return;
      }
    }

    if (intermediateStops.some((stop) => !stop.address.trim())) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.stopAddressRequired'));
      return;
    }

    const missingStopCoords = intermediateStops.some((stop) => !resolveStopCoords(stop));
    if (missingStopCoords) {
      Alert.alert(t('common.error'), t('advertisementsCreate.errors.stopCoordsRequired'));
      return;
    }

    setLoading(true);
    try {
      const pickupCoords =
        parseCoordsFromAddress(normalizedDepartureAddress) || {
          latitude: departureMapRegion.latitude,
          longitude: departureMapRegion.longitude,
        };
      const deliveryCoords =
        parseCoordsFromAddress(normalizedDestinationAddress) || {
          latitude: destinationMapRegion.latitude,
          longitude: destinationMapRegion.longitude,
        };

      const routeStops =
        intermediateStops.length > 0
          ? [
              {
                sequence: 1,
                stop_type: 'pickup' as const,
                label: 'Pickup',
                address: withCoordsSuffix(
                  normalizedDepartureAddress,
                  pickupCoords.latitude,
                  pickupCoords.longitude,
                ),
                lat: pickupCoords.latitude,
                lng: pickupCoords.longitude,
              },
              ...intermediateStops.map((stop, index) => {
                const coords = resolveStopCoords(stop)!;
                const address = stop.address.trim();
                return {
                  sequence: index + 2,
                  stop_type: 'delivery' as const,
                  label: stop.label.trim() || `Stop ${index + 2}`,
                  address: withCoordsSuffix(address, coords.latitude, coords.longitude),
                  lat: coords.latitude,
                  lng: coords.longitude,
                };
              }),
              {
                sequence: intermediateStops.length + 2,
                stop_type: 'delivery' as const,
                label: 'Delivery',
                address: withCoordsSuffix(
                  normalizedDestinationAddress,
                  deliveryCoords.latitude,
                  deliveryCoords.longitude,
                ),
                lat: deliveryCoords.latitude,
                lng: deliveryCoords.longitude,
              },
            ]
          : undefined;

      const payload = {
        photo: photo || undefined,
        title_ru: normalizedTitle,
        title_en: normalizedTitle,
        title_uz: normalizedTitle,
        description_ru: normalizedDescription,
        description_en: normalizedDescription,
        description_uz: normalizedDescription,
        proposed_cost: parsedCost,
        weight: parsedWeight,
        cargo_category: cargoCategory,
        volume_m3: parsedVolume,
        units_count: parsedUnits,
        pickup_window_start: pickupWindowStart || undefined,
        pickup_window_end: pickupWindowEnd || undefined,
        delivery_deadline: deliveryDeadline || undefined,
        contact_name: contactName.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        receiver_name: receiverName.trim() || undefined,
        receiver_phone: receiverPhone.trim() || undefined,
        special_requirements: specialRequirements.length ? specialRequirements : undefined,
        required_body_type: requiredBodyType || undefined,
        requires_adr: specialRequirements.includes('dangerous'),
        requires_reefer: specialRequirements.includes('refrigerated'),
        is_heavy: isHeavy,
        route_preference: routePreference,
        departure_address: normalizedDepartureAddress,
        departure_city: selectedDepartureCity,
        destination_address: normalizedDestinationAddress,
        destination_city: selectedDestinationCity,
        route_stops: routeStops,
      };

      if (isEditMode && editId) {
        await advertisementsService.updateAdvertisement(editId, payload);
        Alert.alert(t('common.success'), t('advertisementsCreate.updatedSuccess'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
        return;
      }

      await advertisementsService.createAdvertisement(payload);

      Alert.alert(t('common.success'), t('advertisementsCreate.createdSuccess'), [
        {
          text: t('advertisementsCreate.goToMyAds'),
          onPress: () => {
            navigation.goBack();
            setTimeout(() => {
              (navigation as any).navigate('MyAdvertisements');
            }, 300);
          },
        },
        {
          text: t('common.ok'),
          style: 'cancel',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      if (
        promptMarketplaceGateError(error, {
          t,
          navigation: navigation as any,
        })
      ) {
        return;
      }
      const responseData = error?.response?.data;
      let message: string | null = responseData?.error || null;
      if (!message && responseData && typeof responseData === 'object') {
        const firstField = Object.keys(responseData)[0];
        const firstValue = firstField ? responseData[firstField] : null;
        if (Array.isArray(firstValue) && firstValue.length > 0) {
          message = String(firstValue[0]);
        } else if (typeof firstValue === 'string') {
          message = firstValue;
        }
      }
      Alert.alert(t('common.error'), message || t('advertisementsCreate.errors.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (loadingLocations) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={isEditMode ? t('advertisements.editAdvertisement') : t('advertisements.createAdvertisement')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={!mapGestureActive}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled">
      <AppHeader variant="hero" title={isEditMode ? t('advertisements.editAdvertisement') : t('advertisements.createAdvertisement')} />
      <Card variant="soft" style={styles.formCard}>
      <Text style={styles.sectionTitle}>{t('advertisementsCreate.sections.image')}</Text>
      <TouchableOpacity style={styles.imagePicker} onPress={handlePickImage}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.image} />
        ) : existingPhotoUrl ? (
          <Image source={{ uri: existingPhotoUrl }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>{t('advertisementsCreate.addImage')}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Input
        label={t('advertisementsCreate.fields.title')}
        value={titleRu}
        onChangeText={setTitleRu}
        placeholder={t('advertisementsCreate.placeholders.title')}
      />

      <Input
        label={t('advertisementsCreate.fields.description')}
        value={descriptionRu}
        onChangeText={setDescriptionRu}
        placeholder={t('advertisementsCreate.placeholders.description')}
        multiline
        numberOfLines={4}
        style={styles.textArea}
      />

      <Input
        label={t('advertisementsCreate.fields.weight')}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      <Input
        label={t('advertisementsCreate.fields.proposedCost')}
        value={proposedCost}
        onChangeText={setProposedCost}
        keyboardType="numeric"
        placeholder={t('advertisementsCreate.placeholders.proposedCost')}
      />

      <Text style={styles.sectionTitle}>{t('advertisementsCreate.sections.cargoDetails')}</Text>
      <Text style={styles.inlineLabel}>{t('advertisementsCreate.fields.cargoType')}</Text>
      <View style={styles.chipWrap}>
        {CARGO_CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.chip, cargoCategory === item.value && styles.chipActive]}
            onPress={() => setCargoCategory(item.value)}
          >
            <Text style={[styles.chipText, cargoCategory === item.value && styles.chipTextActive]}>
              {getCargoCategoryLabel(item.value)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Input
        label={t('advertisementsCreate.fields.volume')}
        value={volumeM3}
        onChangeText={setVolumeM3}
        keyboardType="decimal-pad"
        placeholder={t('advertisementsCreate.placeholders.volume')}
      />
      <Input
        label={t('advertisementsCreate.fields.unitsCount')}
        value={unitsCount}
        onChangeText={setUnitsCount}
        keyboardType="number-pad"
        placeholder={t('advertisementsCreate.placeholders.unitsCount')}
      />

      <Text style={styles.inlineLabel}>{t('advertisementsCreate.fields.bodyType')}</Text>
      <View style={styles.chipWrap}>
        {['tent', 'reefer', 'tanker', 'open', 'van'].map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.chip, requiredBodyType === value && styles.chipActive]}
            onPress={() => setRequiredBodyType(requiredBodyType === value ? '' : value)}
          >
            <Text style={[styles.chipText, requiredBodyType === value && styles.chipTextActive]}>
              {t(`vehicles.bodyTypes.${value}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.chip, isHeavy && styles.chipActive]}
        onPress={() => setIsHeavy(!isHeavy)}
      >
        <Text style={[styles.chipText, isHeavy && styles.chipTextActive]}>{t('advertisementsCreate.fields.heavy')}</Text>
      </TouchableOpacity>

      <Text style={styles.inlineLabel}>{t('advertisementsCreate.fields.specialRequirements')}</Text>
      <View style={styles.chipWrap}>
        {SPECIAL_REQUIREMENTS.map((item) => {
          const selected = specialRequirements.includes(item.value);
          return (
            <TouchableOpacity
              key={item.value}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => toggleRequirement(item.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{getSpecialRequirementLabel(item.value)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{t('advertisementsCreate.sections.timeWindows')}</Text>
      <TouchableOpacity onPress={() => openDateTimePicker('pickupStart', pickupWindowStart)}>
        <View pointerEvents="none">
          <Input label={t('advertisementsCreate.fields.pickupStart')} value={formatDisplayDate(pickupWindowStart)} editable={false} placeholder={t('advertisementsCreate.placeholders.select')} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openDateTimePicker('pickupEnd', pickupWindowEnd)}>
        <View pointerEvents="none">
          <Input label={t('advertisementsCreate.fields.pickupEnd')} value={formatDisplayDate(pickupWindowEnd)} editable={false} placeholder={t('advertisementsCreate.placeholders.select')} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openDateTimePicker('deadline', deliveryDeadline)}>
        <View pointerEvents="none">
          <Input label={t('advertisementsCreate.fields.deliveryDeadline')} value={formatDisplayDate(deliveryDeadline)} editable={false} placeholder={t('advertisementsCreate.placeholders.select')} />
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>{t('advertisementsCreate.sections.contact')}</Text>
      <Input
        label={t('advertisementsCreate.fields.senderName')}
        value={contactName}
        onChangeText={setContactName}
        placeholder={t('advertisementsCreate.placeholders.personName')}
      />
      <Input
        label={t('advertisementsCreate.fields.senderPhone')}
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        placeholder="+998..."
      />
      <Input
        label={t('advertisementsCreate.fields.receiverName')}
        value={receiverName}
        onChangeText={setReceiverName}
        placeholder={t('advertisementsCreate.placeholders.personName')}
      />
      <Input
        label={t('advertisementsCreate.fields.receiverPhone')}
        value={receiverPhone}
        onChangeText={setReceiverPhone}
        keyboardType="phone-pad"
        placeholder="+998..."
      />

      <Text style={styles.inlineLabel}>{t('advertisementsCreate.fields.routePreference')}</Text>
      <View style={styles.chipWrap}>
        {ROUTE_PREFERENCES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.chip, routePreference === item.value && styles.chipActive]}
            onPress={() => setRoutePreference(item.value)}
          >
            <Text style={[styles.chipText, routePreference === item.value && styles.chipTextActive]}>
              {getRoutePreferenceLabel(item.value)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('advertisementsCreate.sections.departureAddress')}</Text>
      <TouchableOpacity onPress={() => openCountrySelection(true)}>
        <Input
          label={t('advertisementsCreate.fields.country')}
          value={countries.find((c) => c.id === selectedDepartureCountry)?.name || ''}
          editable={false}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openCitySelection(true)}>
        <Input
          label={t('advertisementsCreate.fields.city')}
          value={
            isCountryCitiesLoading(selectedDepartureCountry)
              ? t('common.loading')
              : departureCities.find((c) => c.id === selectedDepartureCity)?.name || ''
          }
          editable={false}
        />
      </TouchableOpacity>
      <Input
        label={t('advertisementsCreate.fields.fullAddress')}
        value={departureAddress}
        onChangeText={setDepartureAddress}
        placeholder={t('advertisementsCreate.placeholders.fullAddress')}
        multiline
      />
      <View style={styles.mapPickerBlock}>
        <Text style={styles.mapHint}>{t('advertisementsCreate.map.pickupHint')}</Text>
        <MapPointPicker
          ref={departureMapRef}
          region={departureMapRegion}
          onRegionChange={setDepartureMapRegion}
          onGestureStart={() => setMapGestureActive(true)}
          onGestureEnd={() => setMapGestureActive(false)}
          accentColor={colors.primary}
          height={220}
        />
        <Button
          title={t('advertisementsCreate.map.usePoint')}
          variant="outline"
          loading={addressResolvingTarget === 'departure'}
          onPress={() => insertMapAddress('departure')}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('advertisementsCreate.sections.destinationAddress')}</Text>
      <TouchableOpacity onPress={() => openCountrySelection(false)}>
        <Input
          label={t('advertisementsCreate.fields.country')}
          value={countries.find((c) => c.id === selectedDestinationCountry)?.name || ''}
          editable={false}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openCitySelection(false)}>
        <Input
          label={t('advertisementsCreate.fields.city')}
          value={
            isCountryCitiesLoading(selectedDestinationCountry)
              ? t('common.loading')
              : destinationCities.find((c) => c.id === selectedDestinationCity)?.name || ''
          }
          editable={false}
        />
      </TouchableOpacity>
      <Input
        label={t('advertisementsCreate.fields.fullAddress')}
        value={destinationAddress}
        onChangeText={setDestinationAddress}
        placeholder={t('advertisementsCreate.placeholders.fullAddress')}
        multiline
      />
      <View style={styles.mapPickerBlock}>
        <Text style={styles.mapHint}>{t('advertisementsCreate.map.destinationHint')}</Text>
        <MapPointPicker
          ref={destinationMapRef}
          region={destinationMapRegion}
          onRegionChange={setDestinationMapRegion}
          onGestureStart={() => setMapGestureActive(true)}
          onGestureEnd={() => setMapGestureActive(false)}
          accentColor={colors.success}
          height={220}
        />
        <Button
          title={t('advertisementsCreate.map.usePoint')}
          variant="outline"
          loading={addressResolvingTarget === 'destination'}
          onPress={() => insertMapAddress('destination')}
        />
      </View>

      <Text style={styles.sectionTitle}>
        {t('advertisementsCreate.sections.intermediateStops', { defaultValue: "O'rtacha to'xtashlar" })}
      </Text>
      {intermediateStops.map((stop, index) => {
        const coords = resolveStopCoords(stop);
        return (
          <Card key={`stop-${index}`} variant="soft" style={styles.smartCard}>
            <Input
              label={t('advertisementsCreate.fields.stopLabel', { defaultValue: 'Nuqta nomi' })}
              value={stop.label}
              onChangeText={(value) => {
                const next = [...intermediateStops];
                next[index] = { ...next[index], label: value };
                setIntermediateStops(next);
              }}
              placeholder={t('advertisementsCreate.placeholders.stopLabel', { defaultValue: 'Masalan: Ombor' })}
            />
            <Input
              label={t('advertisementsCreate.fields.fullAddress')}
              value={stop.address}
              onChangeText={(value) => {
                const next = [...intermediateStops];
                const parsed = parseCoordsFromAddress(value);
                next[index] = {
                  ...next[index],
                  address: value,
                  lat: parsed?.latitude ?? next[index].lat ?? null,
                  lng: parsed?.longitude ?? next[index].lng ?? null,
                };
                setIntermediateStops(next);
              }}
              placeholder={t('advertisementsCreate.placeholders.fullAddress')}
              multiline
            />
            <Text style={styles.smartText}>
              {coords
                ? `GPS: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                : t('advertisementsCreate.map.stopCoordsHint')}
            </Text>
            <View style={styles.mapPickerBlock}>
              <Text style={styles.mapHint}>{t('advertisementsCreate.map.stopHint')}</Text>
              <MapPointPicker
                ref={(ref) => {
                  stopMapRefs.current[index] = ref;
                }}
                region={stop.mapRegion ?? DEFAULT_MAP_REGION}
                onRegionChange={(region) => {
                  const next = [...intermediateStops];
                  next[index] = { ...next[index], mapRegion: region };
                  setIntermediateStops(next);
                }}
                onGestureStart={() => setMapGestureActive(true)}
                onGestureEnd={() => setMapGestureActive(false)}
                accentColor={colors.info}
                height={180}
              />
              <Button
                title={t('advertisementsCreate.map.usePoint')}
                variant="outline"
                loading={stopAddressResolvingIndex === index}
                onPress={() => void insertStopMapAddress(index)}
              />
            </View>
            <View style={styles.stopActions}>
              <Button
                title={t('advertisementsCreate.map.useGps')}
                variant="outline"
                loading={stopGpsLoadingIndex === index}
                onPress={() => void fillStopGps(index)}
                style={styles.stopActionBtn}
              />
              <Button
                title={t('advertisementsCreate.map.parseCoords')}
                variant="outline"
                onPress={() => applyStopAddressCoords(index)}
                style={styles.stopActionBtn}
              />
            </View>
            <Button
              title={t('common.delete')}
              variant="outline"
              onPress={() => setIntermediateStops(intermediateStops.filter((_, i) => i !== index))}
            />
          </Card>
        );
      })}
      <Button
        title={t('advertisementsCreate.actions.addStop', { defaultValue: "To'xtash qo'shish" })}
        variant="outline"
        onPress={() =>
          setIntermediateStops([
            ...intermediateStops,
            { label: '', address: '', lat: null, lng: null, mapRegion: DEFAULT_MAP_REGION },
          ])
        }
      />

      <PriceInsightCard
        fromCityId={selectedDepartureCity}
        toCityId={selectedDestinationCity}
        weight={weight}
        onApplySuggested={(amount) => setProposedCost(String(amount))}
      />
      {marketInsightLoading ? (
        <Card variant="soft" style={styles.smartCard}>
          <Text style={styles.smartTitle}>{t('advertisementsCreate.smartInsights.title')}</Text>
          <Text style={styles.smartText}>{t('common.loading')}</Text>
        </Card>
      ) : null}
      {routeHealth ? (
        <Card variant="soft" style={styles.smartCard}>
          <Text style={styles.smartTitle}>{t('advertisementsCreate.smartInsights.routeHealthTitle')}</Text>
          {routeHealth.recommendation ? (
            <View
              style={[
                styles.insightChip,
                routeHealth.recommendation === 'favorable'
                  ? styles.insightChipGood
                  : routeHealth.recommendation.startsWith('caution')
                  ? styles.insightChipWarn
                  : styles.insightChipNeutral,
              ]}>
              <Text style={styles.insightChipText}>
                {t(`advertisementsCreate.smartInsights.recommendation.${routeHealth.recommendation}`, {
                  defaultValue: routeHealth.recommendation,
                })}
              </Text>
            </View>
          ) : null}
          <Text style={styles.smartText}>
            {t('advertisementsCreate.smartInsights.recentPosts', { count: routeHealth.recent_posts_7d })}
          </Text>
          <Text style={styles.smartText}>
            {t('advertisementsCreate.smartInsights.completedOrders', { count: routeHealth.completed_orders_30d })}
          </Text>
          <Text style={styles.smartText}>
            {t('advertisementsCreate.smartInsights.competition', { level: routeHealth.competition_level })}
          </Text>
          <Text style={styles.smartText}>
            {t('advertisementsCreate.smartInsights.matchQuality', {
              level: routeHealth.estimated_match_quality,
            })}
          </Text>
          {routeHealth.avg_close_hours ? (
            <Text style={styles.smartText}>
              {t('advertisementsCreate.smartInsights.avgCloseHours', { hours: routeHealth.avg_close_hours })}
            </Text>
          ) : null}
        </Card>
      ) : null}
      {duplicateRisk && duplicateRisk.matches_count > 0 ? (
        <Card variant="soft" style={[styles.smartCard, styles.duplicateCard]}>
          <Text style={styles.smartTitle}>{t('advertisementsCreate.smartInsights.duplicateTitle')}</Text>
          {duplicateRisk.should_delay ? (
            <Text style={styles.duplicateAlert}>{t('advertisementsCreate.smartInsights.duplicateDelay')}</Text>
          ) : null}
          {!duplicateRisk.should_delay && duplicateRisk.should_review ? (
            <Text style={styles.duplicateWarn}>{t('advertisementsCreate.smartInsights.duplicateReview')}</Text>
          ) : null}
          <Text style={styles.smartText}>
            {t('advertisementsCreate.smartInsights.duplicateCount', { count: duplicateRisk.matches_count })}
          </Text>
          {duplicateRisk.matches.slice(0, 2).map((item) => (
            <Text key={`dup-${item.id}`} style={styles.smartText}>
              • #{item.id} {item.title}
            </Text>
          ))}
        </Card>
      ) : null}
      </Card>

      <Button
        title={t('advertisementsCreate.submit')}
        onPress={handleSubmit}
        loading={loading}
        style={styles.submitButton}
      />

      <Modal
        visible={locationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locationModalMode?.includes('country') ? t('advertisementsCreate.modal.selectCountry') : t('advertisementsCreate.modal.selectCity')}
              </Text>
              <TouchableOpacity onPress={() => {
                setSearchQuery('');
                setLocationModalVisible(false);
              }}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Input
                placeholder={t('common.search')}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
            </View>
            <ScrollView style={styles.modalList}>
              {getFilteredItems().length > 0 ? (
                getFilteredItems().map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.modalItem}
                    onPress={() => handleSelectLocation(item.id)}>
                    <Text style={styles.modalItemText}>{item.name}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {searchQuery.trim()
                      ? t('advertisementsCreate.modal.notFound')
                      : locationModalMode?.includes('country')
                      ? loadingLocations
                        ? t('advertisementsCreate.modal.loadingData')
                        : t('advertisementsCreate.modal.noCountries')
                      : isCountryCitiesLoading(
                            locationModalMode === 'departure-city'
                              ? selectedDepartureCountry
                              : selectedDestinationCountry,
                          )
                      ? t('advertisementsCreate.loadingCities')
                      : t('advertisementsCreate.modal.noCities')}
                  </Text>
                  {!searchQuery.trim() && locationsLoadFailed ? (
                    <Button
                      title={t('common.refresh')}
                      onPress={() => {
                        loadCountries();
                        if (selectedDepartureCountry) {
                          void loadCitiesForCountry(selectedDepartureCountry);
                        }
                        if (selectedDestinationCountry) {
                          void loadCitiesForCountry(selectedDestinationCountry);
                        }
                      }}
                      variant="outline"
                      style={styles.retryButton}
                    />
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {pickerTarget && Platform.OS === 'android' ? (
        <DateTimePicker
          value={pickerDate}
          mode="datetime"
          display="default"
          onChange={handleDateTimeChange}
          minimumDate={new Date()}
        />
      ) : null}
      {pickerTarget && Platform.OS === 'ios' ? (
        <Modal transparent animationType="fade" visible>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>{t('advertisementsCreate.modal.selectTime')}</Text>
              <DateTimePicker
                value={pickerDate}
                mode="datetime"
                display="spinner"
                onChange={handleDateTimeChange}
                minimumDate={new Date()}
                style={styles.pickerControl}
              />
              <View style={styles.pickerActions}>
                <TouchableOpacity onPress={() => setPickerTarget(null)} style={styles.pickerActionBtn}>
                  <Text style={styles.pickerActionText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    applyPickedDate(pickerDate);
                    setPickerTarget(null);
                  }}
                  style={[styles.pickerActionBtn, styles.pickerActionPrimary]}
                >
                  <Text style={[styles.pickerActionText, styles.pickerActionPrimaryText]}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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
    paddingBottom: spacing.xxxl + 24,
  },
  formCard: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inlineLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  imagePicker: {
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.borderLight,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    ...shadows.sm,
  },
  imagePlaceholderText: {
    color: colors.primary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 24,
    marginBottom: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '78%',
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  modalCloseText: {
    fontSize: fontSize.lg,
    color: colors.textTertiary,
    fontWeight: fontWeight.bold,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundTertiary,
  },
  searchInput: {
    marginBottom: 0,
  },
  modalList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  modalItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalItemText: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  emptyContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  pickerTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  pickerControl: {
    alignSelf: 'center',
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pickerActionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
  },
  pickerActionPrimary: {
    backgroundColor: colors.primary,
  },
  pickerActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  pickerActionPrimaryText: {
    color: colors.textLight,
  },
  mapPickerBlock: {
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  mapHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 20,
  },
  mapContainer: {
    height: 180,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  map: {
    flex: 1,
  },
  smartCard: {
    marginTop: spacing.md,
    borderColor: `${colors.primary}14`,
  },
  duplicateCard: {
    borderColor: colors.warning,
  },
  smartTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  smartText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  stopActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  stopActionBtn: {
    flex: 1,
  },
  insightChip: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  insightChipGood: {
    backgroundColor: colors.success + '22',
  },
  insightChipWarn: {
    backgroundColor: colors.warning + '22',
  },
  insightChipNeutral: {
    backgroundColor: colors.backgroundTertiary,
  },
  insightChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  duplicateAlert: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  duplicateWarn: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
    marginBottom: spacing.xs,
  },
});

export default CreateAdvertisementScreen;
