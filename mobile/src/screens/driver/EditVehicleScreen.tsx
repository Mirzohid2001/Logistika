import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { vehiclesService } from '../../services/vehiclesService';
import { Vehicle } from '../../types';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { getMediaUrl } from '../../services/api';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { getVerificationBannerPalette } from '../../theme/bannerPalette';
import { ChipSelect } from '../../components/ChipSelect';

const EditVehicleScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { id } = route.params as { id: number };

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [number, setNumber] = useState('');
  const [cargoVolume, setCargoVolume] = useState('');
  const [loadCapacity, setLoadCapacity] = useState('');
  const [photo, setPhoto] = useState<any>(null);
  const [documentPhotos, setDocumentPhotos] = useState<(any | null)[]>([null]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bodyType, setBodyType] = useState('other');
  const [hasAdr, setHasAdr] = useState(false);
  const [isReefer, setIsReefer] = useState(false);
  const [isHeavy, setIsHeavy] = useState(false);

  useEffect(() => {
    loadVehicle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadVehicle = async () => {
    try {
      setLoading(true);
      const data = await vehiclesService.getVehicle(id);
      setVehicle(data);
      setMake(data.make);
      setModel(data.model);
      setNumber(data.number);
      setCargoVolume(data.cargo_volume.toString());
      setLoadCapacity(data.load_capacity.toString());
      setBodyType(data.body_type || 'other');
      setHasAdr(Boolean(data.has_adr));
      setIsReefer(Boolean(data.is_reefer));
      setIsHeavy(Boolean(data.is_heavy_haul));
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('vehicles.loadError'));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, (response: ImagePickerResponse) => {
      if (response.assets && response.assets[0]) {
        setPhoto({
          uri: response.assets[0].uri,
          type: response.assets[0].type,
          fileName: response.assets[0].fileName || 'vehicle.jpg',
        });
      }
    });
  };

  const handlePickDocument = (index: number) => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, (response: ImagePickerResponse) => {
      if (response.assets && response.assets[0]) {
        const newDocs = [...documentPhotos];
        newDocs[index] = {
          uri: response.assets[0].uri,
          type: response.assets[0].type,
          fileName: response.assets[0].fileName || 'document.jpg',
        };
        setDocumentPhotos(newDocs);
      }
    });
  };

  const handleRemoveDocument = (index: number) => {
    const newDocs = [...documentPhotos];
    newDocs.splice(index, 1);
    setDocumentPhotos(newDocs.length ? newDocs : [null]);
  };

  const handleAddDocument = () => {
    setDocumentPhotos([...documentPhotos, null]);
  };

  const handleSubmit = async () => {
    if (!make || !model || !number || !cargoVolume || !loadCapacity) {
      Alert.alert(t('common.error'), t('vehicles.fillRequired'));
      return;
    }
    const cargoVolumeNum = parseFloat(cargoVolume);
    const loadCapacityNum = parseFloat(loadCapacity);
    if (isNaN(cargoVolumeNum) || cargoVolumeNum <= 0) {
      Alert.alert(t('common.error'), t('vehicles.invalidVolume'));
      return;
    }
    if (isNaN(loadCapacityNum) || loadCapacityNum <= 0) {
      Alert.alert(t('common.error'), t('vehicles.invalidCapacity'));
      return;
    }

    setSaving(true);
    try {
      const validDocs = documentPhotos.filter((doc) => doc !== null);
      await vehiclesService.updateVehicle(id, {
        make,
        model,
        number,
        photo: photo || undefined,
        document_photos: validDocs.length > 0 ? validDocs : undefined,
        cargo_volume: cargoVolumeNum,
        load_capacity: loadCapacityNum,
        body_type: bodyType,
        has_adr: hasAdr,
        is_reefer: isReefer || bodyType === 'reefer',
        is_heavy_haul: isHeavy,
      });
      Alert.alert(t('common.success'), t('vehicles.updateSuccess'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('vehicles.updateError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !vehicle) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('vehicles.editVehicle')} />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  const currentPhotoUri = photo ? photo.uri : getMediaUrl(vehicle.photo);
  const verificationVariant =
    vehicle.verification_status === 'rejected'
      ? 'rejected'
      : vehicle.verification_status === 'pending'
      ? 'pending'
      : null;
  const verificationPalette = verificationVariant
    ? getVerificationBannerPalette(colors, verificationVariant)
    : null;

  return (
    <ScreenBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('vehicles.editVehicle')} />
        {verificationVariant && verificationPalette ? (
          <Card
            style={[
              styles.statusCard,
              { backgroundColor: verificationPalette.bg, borderColor: verificationPalette.border },
            ]}>
            <Text style={[styles.statusTitle, { color: verificationPalette.title }]}>
              {t(
                verificationVariant === 'rejected'
                  ? 'driverVerification.vehicleRejectedTitle'
                  : 'driverVerification.vehiclePendingTitle',
              )}
            </Text>
            <Text style={[styles.statusMessage, { color: verificationPalette.message }]}>
              {verificationVariant === 'rejected'
                ? t('vehicles.documentsResubmitHint')
                : t('vehicles.documentsNote')}
            </Text>
          </Card>
        ) : null}
        <Card variant="elevated" style={styles.card}>
          {currentPhotoUri ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: currentPhotoUri }} style={styles.photo} />
              <TouchableOpacity style={styles.changePhotoButton} onPress={handlePickImage}>
                <Text style={styles.changePhotoText}>{t('vehicles.changePhoto')}</Text>
              </TouchableOpacity>
              {photo && (
                <TouchableOpacity style={styles.removePhotoButton} onPress={() => setPhoto(null)}>
                  <Text style={styles.removePhotoText}>{t('vehicles.cancelPhoto')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.photoPlaceholder} onPress={handlePickImage}>
              <Text style={styles.photoPlaceholderText}>{t('vehicles.addPhoto')}</Text>
            </TouchableOpacity>
          )}

          <Input label={t('vehicles.make')} value={make} onChangeText={setMake} placeholder={t('vehicles.makePlaceholder')} />
          <Input label={t('vehicles.model')} value={model} onChangeText={setModel} placeholder={t('vehicles.modelPlaceholder')} />
          <Input label={t('vehicles.number')} value={number} onChangeText={setNumber} placeholder={t('vehicles.numberPlaceholder')} />
          <Input
            label={t('vehicles.cargoVolumeUnit')}
            value={cargoVolume}
            onChangeText={setCargoVolume}
            placeholder={t('vehicles.cargoVolumePlaceholder')}
            keyboardType="numeric"
          />
          <Input
            label={t('vehicles.loadCapacityUnit')}
            value={loadCapacity}
            onChangeText={setLoadCapacity}
            placeholder={t('vehicles.loadCapacityPlaceholder')}
            keyboardType="numeric"
          />
          <Text style={styles.cardTitle}>{t('vehicles.type')}</Text>
          <ChipSelect
            value={bodyType}
            onChange={setBodyType}
            options={['tent', 'reefer', 'tanker', 'open', 'van', 'other'].map((value) => ({
              value,
              label: t(`vehicles.bodyTypes.${value}`),
            }))}
          />
          <ChipSelect
            multiple
            value={[hasAdr && 'adr', (isReefer || bodyType === 'reefer') && 'reefer', isHeavy && 'heavy'].filter(Boolean) as string[]}
            onChange={(values: string[]) => {
              setHasAdr(values.includes('adr'));
              setIsReefer(values.includes('reefer'));
              setIsHeavy(values.includes('heavy'));
            }}
            options={[
              { value: 'adr', label: t('vehicles.capabilities.adr') },
              { value: 'reefer', label: t('vehicles.capabilities.reefer') },
              { value: 'heavy', label: t('vehicles.capabilities.heavy') },
            ]}
          />
        </Card>

        <Card variant="soft" style={styles.card}>
          <Text style={styles.cardTitle}>{t('vehicles.documentsTitle')}</Text>
          <Text style={styles.description}>{t('vehicles.documentsResubmitHint')}</Text>
          {documentPhotos.map((doc, index) => (
            <View key={index} style={styles.documentItem}>
              <Text style={styles.documentLabel}>{t('vehicles.documentN', { n: index + 1 })}</Text>
              {doc ? (
                <View style={styles.imageContainer}>
                  <Image source={{ uri: doc.uri }} style={styles.documentImage} />
                  <TouchableOpacity style={styles.removeDocButton} onPress={() => handleRemoveDocument(index)}>
                    <Text style={styles.removeDocButtonText}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadButton} onPress={() => handlePickDocument(index)}>
                  <Text style={styles.uploadButtonText}>{t('vehicles.uploadPhoto')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <Button title={t('vehicles.addDocument')} onPress={handleAddDocument} variant="outline" style={styles.addDocumentButton} />
        </Card>

        <Button title={t('common.save')} onPress={handleSubmit} loading={saving} variant="primary" style={styles.submitButton} />
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl + 24 },
  statusCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  statusTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  statusMessage: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  card: { marginBottom: spacing.lg },
  photoContainer: { marginBottom: spacing.lg, alignItems: 'center' },
  photo: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.borderLight,
  },
  changePhotoButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.round,
    marginBottom: spacing.sm,
  },
  changePhotoText: { color: colors.textLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  removePhotoButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: borderRadius.round,
  },
  removePhotoText: { color: colors.textLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  photoPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  photoPlaceholderText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  documentItem: { marginBottom: spacing.md },
  documentLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs },
  imageContainer: { alignItems: 'center' },
  documentImage: { width: '100%', height: 160, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  removeDocButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: borderRadius.round,
  },
  removeDocButtonText: { color: colors.textLight, fontSize: fontSize.sm },
  uploadButton: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  uploadButtonText: { color: colors.primary, fontWeight: fontWeight.semibold },
  addDocumentButton: { marginTop: spacing.sm },
  submitButton: { marginTop: spacing.sm },
});

export default EditVehicleScreen;
