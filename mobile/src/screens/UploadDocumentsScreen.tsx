import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { authService } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { DriverVerificationBanner } from '../components/DriverVerificationBanner';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme/useAppTheme';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { getMediaUrl } from '../services/api';
import { getVerificationBannerPalette } from '../theme/bannerPalette';

const UploadDocumentsScreen = () => {
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const existingDocuments: string[] = Array.isArray(user?.document_photos)
    ? (user?.document_photos ?? [])
    : [];

  const handlePickImage = (index: number) => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, (response: ImagePickerResponse) => {
      if (response.assets && response.assets[0]) {
        const newDocs = [...documents];
        newDocs[index] = {
          uri: response.assets[0].uri,
          type: response.assets[0].type || 'image/jpeg',
          fileName: response.assets[0].fileName || `document_${index}.jpg`,
        };
        setDocuments(newDocs);
      }
    });
  };

  const handleRemoveImage = (index: number) => {
    const newDocs = [...documents];
    newDocs.splice(index, 1);
    setDocuments(newDocs);
  };

  const handleAddMore = () => {
    setDocuments([...documents, null]);
  };

  const handleSubmit = async () => {
    const validDocs = documents.filter((doc) => doc !== null);

    if (validDocs.length === 0) {
      Alert.alert(t('common.error'), t('uploadDocuments.minOneDocument'));
      return;
    }

    setLoading(true);
    try {
      await authService.uploadDocuments(validDocs);
      await refreshUser();
      Alert.alert(t('common.success'), t('uploadDocuments.uploadSuccess'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('uploadDocuments.uploadError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader variant="hero" title={t('uploadDocuments.title')} subtitle={t('uploadDocuments.description')} />
      <DriverVerificationBanner />
      {user?.verification_status === 'pending' && (
        <Card style={styles.statusCard}>
          <Text style={styles.statusTitle}>{t('driverVerification.pendingTitle')}</Text>
          <Text style={styles.statusMessage}>{t('driverVerification.pendingMessage')}</Text>
        </Card>
      )}
      {user?.verification_status === 'rejected' && (
        <Card
          style={[
            styles.statusCard,
            {
              backgroundColor: getVerificationBannerPalette(colors, 'rejected').bg,
              borderColor: getVerificationBannerPalette(colors, 'rejected').border,
            },
          ]}>
          <Text style={[styles.statusTitle, { color: getVerificationBannerPalette(colors, 'rejected').title }]}>
            {t('driverVerification.rejectedTitle')}
          </Text>
          <Text style={[styles.statusMessage, { color: getVerificationBannerPalette(colors, 'rejected').message }]}>
            {t('driverVerification.rejectedMessage')}
          </Text>
        </Card>
      )}
      {existingDocuments.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('uploadDocuments.existingDocuments')}</Text>
          <View style={styles.existingDocsRow}>
            {existingDocuments.map((photoPath, index) => {
              const uri = getMediaUrl(photoPath) || photoPath;
              return uri ? (
                <Image key={`${photoPath}-${index}`} source={{ uri }} style={styles.existingDocThumb} />
              ) : null;
            })}
          </View>
        </Card>
      )}
      <Card style={styles.card}>
        <Text style={styles.description}>{t('uploadDocuments.description')}</Text>
        <Text style={styles.listItem}>• {t('uploadDocuments.passport')}</Text>
        <Text style={styles.listItem}>• {t('uploadDocuments.license')}</Text>
        <Text style={styles.listItem}>• {t('uploadDocuments.vehiclePassport')}</Text>
        <Text style={styles.note}>{t('uploadDocuments.note')}</Text>
      </Card>

      {documents.map((doc, index) => (
        <Card key={index} style={styles.documentCard}>
          <Text style={styles.documentLabel}>
            {t('uploadDocuments.documentLabel', { number: index + 1 })}
          </Text>
          {doc ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: doc.uri }} style={styles.image} />
              <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveImage(index)}>
                <Text style={styles.removeButtonText}>{t('uploadDocuments.remove')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadButton} onPress={() => handlePickImage(index)}>
              <Text style={styles.uploadButtonText}>{t('uploadDocuments.pickImage')}</Text>
            </TouchableOpacity>
          )}
        </Card>
      ))}

      <Button
        title={t('uploadDocuments.addDocument')}
        onPress={handleAddMore}
        variant="outline"
        style={styles.addButton}
      />
      <Button
        title={t('uploadDocuments.submit')}
        onPress={handleSubmit}
        loading={loading}
        variant="primary"
        style={styles.submitButton}
      />
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    statusCard: {
      marginBottom: spacing.lg,
      backgroundColor: colors.primaryGlow,
      borderColor: colors.primary,
      borderWidth: 1,
    },
    statusTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.primaryDark,
      marginBottom: spacing.xs,
    },
    statusMessage: {
      fontSize: fontSize.sm,
      color: colors.primary,
      lineHeight: 20,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    card: {
      marginBottom: spacing.lg,
    },
    cardTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    description: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    listItem: {
      fontSize: fontSize.md,
      color: colors.text,
      marginBottom: spacing.sm,
      paddingLeft: spacing.sm,
    },
    note: {
      fontSize: fontSize.sm,
      color: colors.warning,
      marginTop: spacing.md,
      fontStyle: 'italic',
      lineHeight: 20,
    },
    documentCard: {
      marginBottom: spacing.lg,
    },
    documentLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    imageContainer: {
      alignItems: 'center',
    },
    image: {
      width: '100%',
      height: 200,
      borderRadius: borderRadius.sm,
      marginBottom: spacing.sm,
      backgroundColor: colors.border,
    },
    removeButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.danger,
      borderRadius: borderRadius.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    removeButtonText: {
      color: colors.textLight,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
    },
    uploadButton: {
      width: '100%',
      height: 200,
      borderRadius: borderRadius.sm,
      backgroundColor: colors.backgroundTertiary,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadButtonText: {
      fontSize: fontSize.base,
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
    },
    addButton: {
      marginBottom: spacing.lg,
    },
    submitButton: {
      marginTop: spacing.sm,
    },
    existingDocsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    existingDocThumb: {
      width: 96,
      height: 96,
      borderRadius: borderRadius.sm,
      backgroundColor: colors.border,
    },
  });

export default UploadDocumentsScreen;
