import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { vehiclesService } from '../../services/vehiclesService';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { ChipSelect } from '../../components/ChipSelect';

const CreateVehicleScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [number, setNumber] = useState('');
  const [cargoVolume, setCargoVolume] = useState('');
  const [loadCapacity, setLoadCapacity] = useState('');
  const [photo, setPhoto] = useState<any>(null);
  const [documentPhotos, setDocumentPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [bodyType, setBodyType] = useState('tent');
  const [hasAdr, setHasAdr] = useState(false);
  const [isReefer, setIsReefer] = useState(false);
  const [isHeavy, setIsHeavy] = useState(false);

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
          type: response.assets[0].type || 'image/jpeg',
          fileName: response.assets[0].fileName || `document_${index}.jpg`,
        };
        setDocumentPhotos(newDocs);
      }
    });
  };

  const handleRemoveDocument = (index: number) => {
    const newDocs = [...documentPhotos];
    newDocs.splice(index, 1);
    setDocumentPhotos(newDocs);
  };

  const handleAddDocument = () => {
    setDocumentPhotos([...documentPhotos, null]);
  };

  const handleSubmit = async () => {
    if (!make || !model || !number || !cargoVolume || !loadCapacity) {
      Alert.alert(t('common.error'), t('vehicles.fillRequired'));
      return;
    }
    if (!photo) {
      Alert.alert(t('common.error'), t('vehicles.photoRequired'));
      return;
    }
    const validDocs = documentPhotos.filter((doc) => doc !== null);
    if (validDocs.length === 0) {
      Alert.alert(t('common.error'), t('vehicles.documentsRequired'));
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

    setLoading(true);
    try {
      await vehiclesService.createVehicle({
        make,
        model,
        number,
        photo,
        document_photos: validDocs,
        cargo_volume: cargoVolumeNum,
        load_capacity: loadCapacityNum,
        body_type: bodyType,
        has_adr: hasAdr,
        is_reefer: isReefer || bodyType === 'reefer',
        is_heavy_haul: isHeavy,
      });
      Alert.alert(t('common.success'), t('vehicles.createSuccess'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('vehicles.createError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('vehicles.addVehicle')} />
        <Card variant="elevated" style={styles.card}>
          <Text style={styles.cardTitle}>{t('vehicles.createTitle')}</Text>

          {photo ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <TouchableOpacity style={styles.removePhotoButton} onPress={() => setPhoto(null)}>
                <Text style={styles.removePhotoText}>{t('common.delete')}</Text>
              </TouchableOpacity>
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
          <Text style={styles.description}>{t('vehicles.documentsHint')}</Text>
          <Text style={styles.listItem}>• {t('vehicles.documentsListPassport')}</Text>
          <Text style={styles.listItem}>• {t('vehicles.documentsListPhotos')}</Text>
          <Text style={styles.note}>{t('vehicles.documentsNote')}</Text>

          {documentPhotos.map((doc, index) => (
            <View key={index} style={styles.documentItem}>
              <Text style={styles.documentLabel}>{t('vehicles.documentN', { n: index + 1 })}</Text>
              {doc ? (
                <View style={styles.imageContainer}>
                  <Image source={{ uri: doc.uri }} style={styles.documentImage} />
                  <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveDocument(index)}>
                    <Text style={styles.removeButtonText}>{t('common.delete')}</Text>
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

        <Button title={t('common.add')} onPress={handleSubmit} loading={loading} variant="primary" style={styles.submitButton} />
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl + 24 },
  card: { marginBottom: spacing.lg },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  photoContainer: { marginBottom: spacing.lg, alignItems: 'center' },
  photo: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.borderLight,
  },
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
  submitButton: { marginTop: spacing.sm },
  description: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  listItem: { fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm, paddingLeft: spacing.sm },
  note: {
    fontSize: fontSize.xs,
    color: colors.warning,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  documentItem: { marginBottom: spacing.lg },
  imageContainer: { width: '100%' },
  documentLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  documentImage: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.borderLight,
  },
  removeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: borderRadius.round,
    alignSelf: 'flex-start',
  },
  removeButtonText: { color: colors.textLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  uploadButton: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButtonText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
  addDocumentButton: { marginTop: spacing.sm },
});

export default CreateVehicleScreen;
