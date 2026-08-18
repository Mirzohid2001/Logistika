import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useTranslation} from '../hooks/useTranslation';
import {useDriverActiveOrderTracking} from '../hooks/useDriverActiveOrderTracking';
import { stackScreenOptions } from '../utils/navigationHelpers';
import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import AvailableAdvertisementsScreen from '../screens/driver/AvailableAdvertisementsScreen';
import AdvertisementDetailScreen from '../screens/driver/AdvertisementDetailScreen';
import MyBidsScreen from '../screens/driver/MyBidsScreen';
import OrdersScreen from '../screens/driver/OrdersScreen';
import OrderDetailScreen from '../screens/driver/OrderDetailScreen';
import OrderTrackingScreen from '../screens/driver/OrderTrackingScreen';
import EarningsScreen from '../screens/driver/EarningsScreen';
import DriverStatisticsScreen from '../screens/driver/DriverStatisticsScreen';
import AdvancedAnalyticsScreen from '../screens/driver/AdvancedAnalyticsScreen';
import VehiclesScreen from '../screens/driver/VehiclesScreen';
import CreateVehicleScreen from '../screens/driver/CreateVehicleScreen';
import EditVehicleScreen from '../screens/driver/EditVehicleScreen';
import DriverMatchesScreen from '../screens/driver/DriverMatchesScreen';
import DriverLanesScreen from '../screens/driver/DriverLanesScreen';

const Stack = createStackNavigator();

const DriverNavigator = () => {
  const {t} = useTranslation();
  useDriverActiveOrderTracking();
  return (
    <Stack.Navigator screenOptions={({ navigation }) => stackScreenOptions(navigation)}>
      <Stack.Screen
        name="Dashboard"
        component={DriverDashboardScreen}
        options={{title: t('dashboard.home')}}
      />
      <Stack.Screen
        name="AvailableAdvertisements"
        component={AvailableAdvertisementsScreen}
        options={{title: t('advertisements.title')}}
      />
      <Stack.Screen
        name="AdvertisementDetail"
        component={AdvertisementDetailScreen}
        options={{title: t('advertisements.advertisementDetail')}}
      />
      <Stack.Screen
        name="MyBids"
        component={MyBidsScreen}
        options={{title: t('bids.myBids')}}
      />
      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={({ route }: any) => {
          const filter = route.params?.filter;
          let title = t('orders.title');
          if (filter === 'active') {
            title = t('orders.activeOrders');
          } else if (filter === 'completed') {
            title = t('orders.orderHistory');
          }
          return { title };
        }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{title: t('orders.orderDetail')}}
      />
      <Stack.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{title: t('orders.tracking')}}
      />
      <Stack.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{title: t('dashboard.earnings')}}
      />
      <Stack.Screen
        name="Statistics"
        component={DriverStatisticsScreen}
        options={{title: t('statistics.title')}}
      />
      <Stack.Screen
        name="AdvancedAnalytics"
        component={AdvancedAnalyticsScreen}
        options={{title: t('analytics.title')}}
      />
      <Stack.Screen
        name="DriverMatches"
        component={DriverMatchesScreen}
        options={{title: t('matching.feed.title')}}
      />
      <Stack.Screen
        name="DriverLanes"
        component={DriverLanesScreen}
        options={{title: t('matching.lanes.title')}}
      />
      <Stack.Screen
        name="Vehicles"
        component={VehiclesScreen}
        options={{title: t('vehicles.title')}}
      />
      <Stack.Screen
        name="CreateVehicle"
        component={CreateVehicleScreen}
        options={{title: t('vehicles.addVehicle')}}
      />
      <Stack.Screen
        name="EditVehicle"
        component={EditVehicleScreen}
        options={{title: t('vehicles.editVehicle')}}
      />
    </Stack.Navigator>
  );
};

export default DriverNavigator;


