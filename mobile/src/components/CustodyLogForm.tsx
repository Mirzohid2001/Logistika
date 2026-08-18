import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Button } from './Button';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

const EVENT_TYPES = [
  'pickup_handed',
  'stop_handed',
  'delivery_handed',
  'seal_verified',
  'temperature_check',
] as const;

export type CustodyPhotoAsset = {
  uri: string;
  type?: string;
  fileName?: string;
};

export type CustodyLogPayload = {
  event_type: string;
  note?: string;
  witness_name?: string;
  lat?: number;
  lng?: number;
  photo?: CustodyPhotoAsset;
};

type CustodyLogFormProps = {
  onSubmit: (payload: CustodyLogPayload) => Promise<void>;
};

export const CustodyLogForm: React.FC<CustodyLogFormProps> = ({ onSubmit }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>('pickup_handed');
  const [note, setNote] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [photo, setPhoto] = useState<CustodyPhotoAsset | null>(null);

  const captureGps = useCallback(async () => {
    try {
      setLocating(true);
      setLocationError(false);
      const granted = await Geolocation.requestAuthorization('whenInUse');
      if (granted !== 'granted') {
        setLocationError(true);
        setCoords(null);
        return;
      }
      const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setLocationError(false);
    } catch {
      setLocationError(true);
      setCoords(null);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void captureGps();
  }, [captureGps]);

  const applyPickerResponse = (response: ImagePickerResponse) => {
    if (response.didCancel || response.errorCode) {
      return;
    }
    const asset = response.assets?.[0];
    if (!asset?.uri) {
      return;
    }
    setPhoto({
      uri: asset.uri,
      type: asset.type || 'image/jpeg',
      fileName: asset.fileName || `custody_${Date.now()}.jpg`,
    });
  };

  const handlePickPhoto = () => {
    Alert.alert(t('features.custody.photoTitle'), t('features.custody.photoHint'), [
      {
        text: t('features.custody.takePhoto'),
        onPress: () => {
          launchCamera(
            { mediaType: 'photo', quality: 0.8, saveToPhotos: false },
            applyPickerResponse,
          );
        },
      },
      {
        text: t('features.custody.chooseGallery'),
        onPress: () => {
          launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, applyPickerResponse);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!coords) {
      Alert.alert(t('common.error'), t('features.custody.locationRequired'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('features.custody.retryGps'), onPress: () => void captureGps() },
      ]);
      return;
    }

    try {
      setLoading(true);
      await onSubmit({
        event_type: eventType,
        note: note.trim() || undefined,
        witness_name: witnessName.trim() || undefined,
        lat: coords.lat,
        lng: coords.lng,
        photo: photo || undefined,
      });
      setNote('');
      setWitnessName('');
      setPhoto(null);
      Alert.alert(t('common.success'), t('features.custody.logged'));
      void captureGps();
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('features.custody.logFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('features.custody.logTitle')}</Text>
      <View style={styles.chips}>
        {EVENT_TYPES.map((type) => (
          <Text
            key={type}
            style={[styles.chip, eventType === type && styles.chipActive]}
            onPress={() => setEventType(type)}>
            {t(`features.custody.events.${type}`)}
          </Text>
        ))}
      </View>

      <View style={styles.gpsRow}>
        <MaterialIcons
          name={coords ? 'my-location' : locationError ? 'location-off' : 'location-searching'}
          size={18}
          color={coords ? colors.success : locationError ? colors.error : colors.textSecondary}
        />
        <View style={styles.gpsMeta}>
          {locating ? (
            <Text style={styles.gpsText}>{t('features.custody.locating')}</Text>
          ) : coords ? (
            <Text style={styles.gpsText}>
              GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </Text>
          ) : (
            <Text style={[styles.gpsText, styles.gpsError]}>
              {t('features.custody.locationRequired')}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => void captureGps()} disabled={locating} hitSlop={8}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.retryLink}>{t('features.custody.retryGps')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto} activeOpacity={0.8}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialIcons name="photo-camera" size={28} color={colors.primary} />
            <Text style={styles.photoPlaceholderText}>{t('features.custody.addPhoto')}</Text>
          </View>
        )}
      </TouchableOpacity>
      {photo ? (
        <TouchableOpacity onPress={() => setPhoto(null)} style={styles.removePhoto}>
          <Text style={styles.removePhotoText}>{t('features.custody.removePhoto')}</Text>
        </TouchableOpacity>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder={t('features.custody.witnessPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        value={witnessName}
        onChangeText={setWitnessName}
      />
      <TextInput
        style={[styles.input, styles.noteInput]}
        placeholder={t('features.custody.notePlaceholder')}
        placeholderTextColor={colors.textTertiary}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <Button title={t('features.custody.logAction')} onPress={handleSubmit} loading={loading} />
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      overflow: 'hidden',
    },
    chipActive: {
      borderColor: colors.primary,
      color: colors.primary,
      backgroundColor: colors.primaryGlow,
    },
    gpsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      paddingVertical: spacing.xs,
    },
    gpsMeta: {
      flex: 1,
    },
    gpsText: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    gpsError: {
      color: colors.error,
    },
    retryLink: {
      fontSize: fontSize.xs,
      color: colors.primary,
      fontWeight: fontWeight.semibold,
    },
    photoButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      marginBottom: spacing.sm,
      backgroundColor: colors.background,
    },
    photoPreview: {
      width: '100%',
      height: 160,
    },
    photoPlaceholder: {
      height: 96,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    photoPlaceholderText: {
      fontSize: fontSize.sm,
      color: colors.primary,
      fontWeight: fontWeight.semibold,
    },
    removePhoto: {
      alignSelf: 'flex-end',
      marginBottom: spacing.sm,
      marginTop: -4,
    },
    removePhotoText: {
      fontSize: fontSize.xs,
      color: colors.error,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.sm,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    noteInput: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
  });
