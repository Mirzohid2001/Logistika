import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from '../hooks/useTranslation';
import DispatcherDashboardScreen from '../screens/dispatcher/DispatcherDashboardScreen';
import DispatcherOrdersScreen from '../screens/dispatcher/DispatcherOrdersScreen';
import DispatcherOrderDetailScreen from '../screens/dispatcher/DispatcherOrderDetailScreen';
import DispatcherAssignScreen from '../screens/dispatcher/DispatcherAssignScreen';
import DispatcherStatisticsScreen from '../screens/dispatcher/DispatcherStatisticsScreen';
import DispatcherDriversListScreen from '../screens/dispatcher/DispatcherDriversListScreen';
import DispatcherDriverDetailScreen from '../screens/dispatcher/DispatcherDriverDetailScreen';
import DispatcherDriverOrdersScreen from '../screens/dispatcher/DispatcherDriverOrdersScreen';
import DispatcherClientsListScreen from '../screens/dispatcher/DispatcherClientsListScreen';
import DispatcherClientDetailScreen from '../screens/dispatcher/DispatcherClientDetailScreen';
import DispatcherClientOrdersScreen from '../screens/dispatcher/DispatcherClientOrdersScreen';
import DispatcherOrdersMapScreen from '../screens/dispatcher/DispatcherOrdersMapScreen';
import DispatcherAnalyticsScreen from '../screens/dispatcher/DispatcherAnalyticsScreen';
import DispatcherBulkOperationsScreen from '../screens/dispatcher/DispatcherBulkOperationsScreen';
import DispatcherExportScreen from '../screens/dispatcher/DispatcherExportScreen';
import DispatcherMonitoringScreen from '../screens/dispatcher/DispatcherMonitoringScreen';
import StaffComplaintsScreen from '../screens/staff/StaffComplaintsScreen';
import StaffComplaintDetailScreen from '../screens/staff/StaffComplaintDetailScreen';
import DispatcherDriverDocumentsScreen from '../screens/dispatcher/DispatcherDriverDocumentsScreen';

const Stack = createStackNavigator();

const DispatcherNavigator = () => {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="DispatcherDashboard"
        component={DispatcherDashboardScreen}
        options={{ title: t('profile.dispatcher') }}
      />
      <Stack.Screen
        name="DispatcherOrders"
        component={DispatcherOrdersScreen}
        options={{ title: t('dispatcherDashboard.allOrders') }}
      />
      <Stack.Screen
        name="DispatcherOrderDetail"
        component={DispatcherOrderDetailScreen}
        options={{ title: t('dispatcherLists.orderDetailTitle') }}
      />
      <Stack.Screen
        name="DispatcherAssign"
        component={DispatcherAssignScreen}
        options={{ title: t('dispatcherLists.assignTitle') }}
      />
      <Stack.Screen
        name="DispatcherStatistics"
        component={DispatcherStatisticsScreen}
        options={{ title: t('dispatcherDashboard.statistics') }}
      />
      <Stack.Screen
        name="DispatcherDriversList"
        component={DispatcherDriversListScreen}
        options={{ title: t('dispatcherDashboard.drivers') }}
      />
      <Stack.Screen
        name="DispatcherDriverDetail"
        component={DispatcherDriverDetailScreen}
        options={{ title: t('dispatcherLists.driverDetailTitle') }}
      />
      <Stack.Screen
        name="DispatcherDriverOrders"
        component={DispatcherDriverOrdersScreen}
        options={{ title: t('dispatcherLists.driverOrdersTitle') }}
      />
      <Stack.Screen
        name="DispatcherClientsList"
        component={DispatcherClientsListScreen}
        options={{ title: t('dispatcherDashboard.clients') }}
      />
      <Stack.Screen
        name="DispatcherClientDetail"
        component={DispatcherClientDetailScreen}
        options={{ title: t('dispatcherLists.clientDetailTitle') }}
      />
      <Stack.Screen
        name="DispatcherClientOrders"
        component={DispatcherClientOrdersScreen}
        options={{ title: t('dispatcherLists.clientOrdersTitle') }}
      />
      <Stack.Screen
        name="DispatcherOrdersMap"
        component={DispatcherOrdersMapScreen}
        options={{ title: t('dispatcherDashboard.showOnMap') }}
      />
      <Stack.Screen
        name="DispatcherAnalytics"
        component={DispatcherAnalyticsScreen}
        options={{ title: t('dispatcherOps.analyticsTitle') }}
      />
      <Stack.Screen
        name="DispatcherBulkOperations"
        component={DispatcherBulkOperationsScreen}
        options={{ title: t('dispatcherOps.openBulk') }}
      />
      <Stack.Screen
        name="DispatcherExport"
        component={DispatcherExportScreen}
        options={{ title: t('dispatcherOps.openExport') }}
      />
      <Stack.Screen
        name="DispatcherMonitoring"
        component={DispatcherMonitoringScreen}
        options={{ title: t('dispatcherDashboard.realtimeMonitoring') }}
      />
      <Stack.Screen
        name="DispatcherDriverDocuments"
        component={DispatcherDriverDocumentsScreen}
        initialParams={{ mode: 'dispatcher' }}
        options={{ title: t('features.driverDocsMonitor.title') }}
      />
      <Stack.Screen
        name="StaffComplaints"
        component={StaffComplaintsScreen}
        options={{ title: t('complaints.staff.queueTitle') }}
      />
      <Stack.Screen
        name="StaffComplaintDetail"
        component={StaffComplaintDetailScreen}
        options={{ title: t('complaints.staff.detailTitle') }}
      />
    </Stack.Navigator>
  );
};

export default DispatcherNavigator;
