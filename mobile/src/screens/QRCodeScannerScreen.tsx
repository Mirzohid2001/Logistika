import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import QRCodeScanner from 'react-native-qrcode-scanner';
import { RNCamera } from 'react-native-camera';
import { ordersService } from '../services/ordersService';
import { useTranslation } from '../hooks/useTranslation';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { ScreenBackground } from '../components/ScreenBackground';

const QRCodeScannerScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);

  const { mode = 'verify' } = (route.params as any) || {}; // 'verify' yoki 'approve'

  // Fix for missing mode variable
  const scanMode = mode || 'verify';

  const handleBarCodeRead = async (e: any) => {
    if (processing || !scanning) {return;}

    const qrCode = e.data;
    if (!qrCode) {return;}

    setScanning(false);
    setProcessing(true);

    try {
      if (scanMode === 'approve') {
        // Client uchun: QR kod orqali order'ni tasdiqlash
        const order = await ordersService.verifyAndApproveOrderByQR(qrCode);
        Alert.alert(
          t('common.success'),
          t('orders.orderApproved'),
          [
            {
              text: t('common.ok'),
              onPress: () => {
                navigation.goBack();
                // Order detail'ga o'tish
                setTimeout(() => {
                  (navigation as any).navigate('ClientStack', {
                    screen: 'ClientOrderDetail',
                    params: { id: order.id },
                  });
                }, 300);
              },
            },
          ]
        );
      } else {
        // QR kod orqali order'ni tekshirish
        const order = await ordersService.verifyOrderByQR(qrCode);
        Alert.alert(
          t('common.success'),
          `Buyurtma #${order.id} topildi`,
          [
            {
              text: t('common.ok'),
              onPress: () => {
                navigation.goBack();
                // Order detail'ga o'tish
                setTimeout(() => {
                  const driverId = typeof order.driver === 'number' ? order.driver : order.driver?.id;
                  const stackName = driverId === (route.params as any)?.userId
                    ? 'DriverStack'
                    : 'ClientStack';
                  (navigation as any).navigate(stackName, {
                    screen: stackName === 'DriverStack' ? 'DriverOrderDetail' : 'ClientOrderDetail',
                    params: { id: order.id },
                  });
                }, 300);
              },
            },
          ]
        );
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || t('common.error');
      Alert.alert(t('common.error'), errorMessage, [
        {
          text: t('common.ok'),
          onPress: () => {
            setScanning(true);
            setProcessing(false);
          },
        },
      ]);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ScreenBackground withOrbs={false}>
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {scanMode === 'approve' ? t('orders.approveOrder') : 'QR Kod Tekshirish'}
        </Text>
        <View style={styles.backButton} />
      </View>

      {processing ? (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingText}>
            {scanMode === 'approve' ? 'Tasdiqlanmoqda...' : 'Tekshirilmoqda...'}
          </Text>
        </View>
      ) : (
        <QRCodeScanner
          onRead={({ data }) => handleBarCodeRead({ data })}
          flashMode={RNCamera.Constants.FlashMode.auto}
          topContent={
            <Text style={styles.centerText}>
              {scanMode === 'approve'
                ? 'Buyurtma QR kodini skaner qiling'
                : 'QR kodni kameraga qarating'}
            </Text>
          }
          bottomContent={
            <TouchableOpacity
              style={styles.buttonTouchable}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          }
        />
      )}
    </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cameraBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 15,
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textLight,
  },
  centerText: {
    flex: 1,
    fontSize: 18,
    padding: 32,
    color: colors.textLight,
    textAlign: 'center',
  },
  buttonText: {
    fontSize: 21,
    color: colors.primary,
    fontWeight: '600',
  },
  buttonTouchable: {
    fontSize: 16,
    backgroundColor: colors.backgroundSecondary,
    marginTop: 32,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cameraBackground,
  },
  processingText: {
    marginTop: 20,
    fontSize: 16,
    color: colors.textLight,
  },
});

export default QRCodeScannerScreen;
