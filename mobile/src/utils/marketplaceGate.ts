import { Alert } from 'react-native';
import { errorService, ErrorCode } from '../services/errorService';
import { navigateRoot, type NavigationLike } from './navigationHelpers';

/**
 * Returns true if the error was handled as a marketplace gate (subscription/payment).
 */
export function promptMarketplaceGateError(
  error: unknown,
  options: {
    t: (key: string, params?: Record<string, unknown>) => string;
    navigation: NavigationLike;
    fallbackTitle?: string;
    onVerification?: () => void;
  },
): boolean {
  const parsed = errorService.parseError(error);
  if (
    parsed.code === ErrorCode.SUBSCRIPTION_REQUIRED ||
    parsed.code === ErrorCode.PAYMENT_REQUIRED
  ) {
    Alert.alert(
      options.t('subscriptions.requiredTitle'),
      parsed.message || options.t('subscriptions.requiredMessage'),
      [
        { text: options.t('common.cancel'), style: 'cancel' },
        {
          text: options.t('subscriptions.openPaywall'),
          onPress: () => navigateRoot(options.navigation, 'SubscriptionPaywall'),
        },
      ],
    );
    return true;
  }
  return false;
}

export function promptDocumentExpiredError(
  error: unknown,
  options: {
    t: (key: string, params?: Record<string, unknown>) => string;
    navigation: NavigationLike;
  },
): boolean {
  const parsed = errorService.parseError(error);
  if (parsed.code !== ErrorCode.DOCUMENT_EXPIRED) {
    return false;
  }
  Alert.alert(
    options.t('driverVerification.documentsExpiredTitle'),
    parsed.message || options.t('driverVerification.documentsExpiredMessage'),
    [
      { text: options.t('common.cancel'), style: 'cancel' },
      {
        text: options.t('profile.openDocuments'),
        onPress: () => navigateRoot(options.navigation, 'DriverDocuments'),
      },
    ],
  );
  return true;
}

export function isDocumentExpiredError(error: unknown): boolean {
  return errorService.parseError(error).code === ErrorCode.DOCUMENT_EXPIRED;
}

export function isSubscriptionGateError(error: unknown): boolean {
  const parsed = errorService.parseError(error);
  return (
    parsed.code === ErrorCode.SUBSCRIPTION_REQUIRED ||
    parsed.code === ErrorCode.PAYMENT_REQUIRED
  );
}
