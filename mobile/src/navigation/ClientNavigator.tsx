import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {TouchableOpacity, View, StyleSheet} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTranslation} from '../hooks/useTranslation';
import { spacing } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';
import ClientDashboardScreen from '../screens/client/ClientDashboardScreen';
import AdvertisementsListScreen from '../screens/client/AdvertisementsListScreen';
import AdvertisementDetailScreen from '../screens/client/AdvertisementDetailScreen';
import CreateAdvertisementScreen from '../screens/client/CreateAdvertisementScreen';
import MyAdvertisementsScreen from '../screens/client/MyAdvertisementsScreen';
import BidsScreen from '../screens/client/BidsScreen';
import OrdersScreen from '../screens/client/OrdersScreen';
import OrderDetailScreen from '../screens/client/OrderDetailScreen';
import OrderTrackingScreen from '../screens/client/OrderTrackingScreen';
import ClientStatisticsScreen from '../screens/client/ClientStatisticsScreen';
import AdvancedAnalyticsScreen from '../screens/client/AdvancedAnalyticsScreen';
import { stackScreenOptions } from '../utils/navigationHelpers';

const Stack = createStackNavigator();

const ClientNavigator = () => {
  const {t} = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack.Navigator screenOptions={({ navigation }) => stackScreenOptions(navigation)}>
      <Stack.Screen
        name="Dashboard"
        component={ClientDashboardScreen}
        options={{title: t('dashboard.home')}}
      />
      <Stack.Screen
        name="AdvertisementsList"
        component={AdvertisementsListScreen}
        options={({navigation}) => ({
          title: t('advertisements.title'),
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => navigation.navigate('MyAdvertisements')}
                accessibilityRole="button"
                accessibilityLabel={t('advertisements.myAdvertisements')}>
                <MaterialIcons name="description" size={22} color={colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => navigation.navigate('ClientOrders')}
                accessibilityRole="button"
                accessibilityLabel={t('orders.myOrders')}>
                <MaterialIcons name="local-shipping" size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>
          ),
        })}
      />
      <Stack.Screen
        name="AdvertisementDetail"
        component={AdvertisementDetailScreen}
        options={{title: t('advertisements.advertisementDetail')}}
      />
      <Stack.Screen
        name="CreateAdvertisement"
        component={CreateAdvertisementScreen}
        options={{title: t('advertisements.createAdvertisement')}}
      />
      <Stack.Screen
        name="MyAdvertisements"
        component={MyAdvertisementsScreen}
        options={{title: t('advertisements.myAdvertisements')}}
      />
      <Stack.Screen
        name="Bids"
        component={BidsScreen}
        options={{title: t('bids.title')}}
      />
      <Stack.Screen
        name="ClientOrders"
        component={OrdersScreen}
        options={{title: t('orders.myOrders')}}
      />
      <Stack.Screen
        name="ClientOrderDetail"
        component={OrderDetailScreen}
        options={{title: t('orders.orderDetail')}}
      />
      <Stack.Screen
        name="ClientOrderTracking"
        component={OrderTrackingScreen}
        options={{title: t('orders.tracking')}}
      />
      <Stack.Screen
        name="Statistics"
        component={ClientStatisticsScreen}
        options={{title: t('statistics.title')}}
      />
      <Stack.Screen
        name="AdvancedAnalytics"
        component={AdvancedAnalyticsScreen}
        options={{title: t('analytics.title')}}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  headerButton: {
    marginLeft: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ClientNavigator;
