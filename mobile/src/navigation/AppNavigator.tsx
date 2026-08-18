import React, { useRef, useEffect, useMemo } from 'react';
import {NavigationContainer, DarkTheme, DefaultTheme} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {useAuth} from '../context/AuthContext';
import SubscriptionPaywallScreen from '../screens/SubscriptionPaywallScreen';
import { pushNotificationService } from '../services/pushNotificationService';
import { getActiveRouteName } from '../utils/navigationHelpers';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import LoadingScreen from '../screens/LoadingScreen';
import NewsListScreen from '../screens/NewsListScreen';
import NewsDetailScreen from '../screens/NewsDetailScreen';
import ContentScreen from '../screens/ContentScreen';
import UploadDocumentsScreen from '../screens/UploadDocumentsScreen';
import DriverDocumentsScreen from '../screens/driver/DriverDocumentsScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import RatingScreen from '../screens/RatingScreen';
import ComplaintScreen from '../screens/ComplaintScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import SavedSearchesScreen from '../screens/SavedSearchesScreen';
import QRCodeScannerScreen from '../screens/QRCodeScannerScreen';
import ReviewsHistoryScreen from '../screens/ReviewsHistoryScreen';
import ComplaintsHistoryScreen from '../screens/ComplaintsHistoryScreen';
import CompanyInnScreen from '../screens/CompanyInnScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import CompanyMembersScreen from '../screens/CompanyMembersScreen';
import PaymentCheckoutScreen from '../screens/PaymentCheckoutScreen';
import CreatePaymentScreen from '../screens/client/CreatePaymentScreen';
import PaymentsScreen from '../screens/client/PaymentsScreen';
import PaymentDetailScreen from '../screens/client/PaymentDetailScreen';
import PublicTrackingShareScreen from '../screens/PublicTrackingShareScreen';
import OpenTrackingLinkScreen from '../screens/OpenTrackingLinkScreen';
import { useAppTheme } from '../theme/useAppTheme';
import { appLinkingConfig } from './linking';

const Stack = createStackNavigator();

const GATED_ROUTES = new Set(['SubscriptionPaywall', 'CompanyInn']);

const AppNavigator = () => {
  const {isAuthenticated, isLoading, needsSubscription, hasActiveSubscription, user} = useAuth();
  const { isDark, colors } = useAppTheme();
  const navigationTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.primary,
        background: colors.background,
        card: colors.cardBackground,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    }),
    [isDark, colors],
  );
  const showPaywall = isAuthenticated && needsSubscription && !hasActiveSubscription;
  const needsCompanyInn =
    isAuthenticated &&
    !showPaywall &&
    user?.is_client &&
    (user.account?.company_inn_required || !user.company_inn);
  const navigationRef = useRef<any>(null);
  const lastGateRef = useRef<'paywall' | 'inn' | 'none'>('none');
  const wasAuthenticatedRef = useRef(isAuthenticated);

  React.useEffect(() => {
    if (navigationRef.current) {
      pushNotificationService.setNavigationRef(navigationRef.current);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const nav = navigationRef.current;
    if (!nav || isLoading) {
      return;
    }

    if (wasAuthenticatedRef.current !== isAuthenticated) {
      wasAuthenticatedRef.current = isAuthenticated;
      if (isAuthenticated) {
        const routeName = showPaywall
          ? 'SubscriptionPaywall'
          : needsCompanyInn
            ? 'CompanyInn'
            : 'Main';
        nav.reset({ index: 0, routes: [{ name: routeName }] });
        lastGateRef.current =
          routeName === 'SubscriptionPaywall' ? 'paywall' : routeName === 'CompanyInn' ? 'inn' : 'none';
      } else {
        nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
        lastGateRef.current = 'none';
      }
      return;
    }
  }, [isAuthenticated, isLoading, showPaywall, needsCompanyInn]);

  useEffect(() => {
    const nav = navigationRef.current;
    if (!nav || !isAuthenticated) {
      lastGateRef.current = 'none';
      return;
    }

    const currentRoute = getActiveRouteName(nav.getRootState());
    const nextGate: 'paywall' | 'inn' | 'none' = showPaywall
      ? 'paywall'
      : needsCompanyInn
        ? 'inn'
        : 'none';

    if (nextGate === 'paywall' && currentRoute !== 'SubscriptionPaywall') {
      nav.reset({ index: 0, routes: [{ name: 'SubscriptionPaywall' }] });
      lastGateRef.current = 'paywall';
      return;
    }

    if (nextGate === 'inn' && currentRoute !== 'CompanyInn') {
      nav.reset({ index: 0, routes: [{ name: 'CompanyInn' }] });
      lastGateRef.current = 'inn';
      return;
    }

    if (nextGate === 'none' && lastGateRef.current !== 'none' && GATED_ROUTES.has(currentRoute || '')) {
      nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      lastGateRef.current = 'none';
      return;
    }

    if (nextGate === 'none') {
      lastGateRef.current = 'none';
    }
  }, [isAuthenticated, showPaywall, needsCompanyInn, user?.company_inn]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} linking={appLinkingConfig}>
      <Stack.Navigator
        screenOptions={{headerShown: false}}
        initialRouteName={isAuthenticated ? 'Main' : 'Auth'}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainNavigator} />
            <Stack.Screen name="SubscriptionPaywall" component={SubscriptionPaywallScreen} />
            <Stack.Screen name="CompanyInn" component={CompanyInnScreen} />
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
            <Stack.Screen name="Rating" component={RatingScreen} />
            <Stack.Screen name="Complaint" component={ComplaintScreen} />
            <Stack.Screen name="Favorites" component={FavoritesScreen} />
            <Stack.Screen name="SavedSearches" component={SavedSearchesScreen} />
            <Stack.Screen name="QRCodeScanner" component={QRCodeScannerScreen} />
            <Stack.Screen name="ReviewsHistory" component={ReviewsHistoryScreen} />
            <Stack.Screen name="ComplaintsHistory" component={ComplaintsHistoryScreen} />
            <Stack.Screen name="NewsList" component={NewsListScreen} />
            <Stack.Screen name="NewsDetail" component={NewsDetailScreen} />
            <Stack.Screen name="Content" component={ContentScreen} />
            <Stack.Screen name="UploadDocuments" component={UploadDocumentsScreen} />
            <Stack.Screen name="DriverDocuments" component={DriverDocumentsScreen} />
            <Stack.Screen name="CompanyMembers" component={CompanyMembersScreen} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
            <Stack.Screen name="PaymentCheckout" component={PaymentCheckoutScreen} />
            <Stack.Screen name="CreatePayment" component={CreatePaymentScreen} />
            <Stack.Screen name="Payments" component={PaymentsScreen} />
            <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
        <Stack.Screen name="PublicTrackingShare" component={PublicTrackingShareScreen} />
        <Stack.Screen name="OpenTrackingLink" component={OpenTrackingLinkScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
