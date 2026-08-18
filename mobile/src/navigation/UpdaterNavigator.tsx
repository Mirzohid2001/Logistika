import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from '../hooks/useTranslation';
import UpdaterDashboardScreen from '../screens/updater/UpdaterDashboardScreen';
import UpdaterPendingUpdatesScreen from '../screens/updater/UpdaterPendingUpdatesScreen';
import UpdaterOrderUpdateScreen from '../screens/updater/UpdaterOrderUpdateScreen';
import UpdaterTrackingScreen from '../screens/updater/UpdaterTrackingScreen';
import UpdaterActiveTrackingScreen from '../screens/updater/UpdaterActiveTrackingScreen';
import UpdaterLogsScreen from '../screens/updater/UpdaterLogsScreen';
import UpdaterStatisticsScreen from '../screens/updater/UpdaterStatisticsScreen';
import UpdaterOrderHistoryScreen from '../screens/updater/UpdaterOrderHistoryScreen';
import UpdaterPaymentMonitoringScreen from '../screens/updater/UpdaterPaymentMonitoringScreen';
import UpdaterProblematicOrdersScreen from '../screens/updater/UpdaterProblematicOrdersScreen';
import UpdaterAnalyticsScreen from '../screens/updater/UpdaterAnalyticsScreen';
import UpdaterBulkOperationsScreen from '../screens/updater/UpdaterBulkOperationsScreen';
import UpdaterExportScreen from '../screens/updater/UpdaterExportScreen';
import StaffComplaintsScreen from '../screens/staff/StaffComplaintsScreen';
import StaffComplaintDetailScreen from '../screens/staff/StaffComplaintDetailScreen';
import DispatcherDriverDocumentsScreen from '../screens/dispatcher/DispatcherDriverDocumentsScreen';

const Stack = createStackNavigator();

const UpdaterNavigator = () => {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="UpdaterDashboard"
        component={UpdaterDashboardScreen}
        options={{ title: t('profile.updater') }}
      />
      <Stack.Screen
        name="UpdaterPendingUpdates"
        component={UpdaterPendingUpdatesScreen}
        options={{ title: t('updaterDashboard.pendingUpdates') }}
      />
      <Stack.Screen
        name="UpdaterOrderUpdate"
        component={UpdaterOrderUpdateScreen}
        options={{ title: t('updaterLists.updateOrderTitle') }}
      />
      <Stack.Screen
        name="UpdaterTracking"
        component={UpdaterTrackingScreen}
        options={{ title: t('updaterDashboard.activeTracking') }}
      />
      <Stack.Screen
        name="UpdaterActiveTracking"
        component={UpdaterActiveTrackingScreen}
        options={{ title: t('updaterDashboard.activeTracking') }}
      />
      <Stack.Screen
        name="UpdaterLogs"
        component={UpdaterLogsScreen}
        options={{ title: t('updaterDashboard.updateLogs') }}
      />
      <Stack.Screen
        name="UpdaterStatistics"
        component={UpdaterStatisticsScreen}
        options={{ title: t('updaterDashboard.statistics') }}
      />
      <Stack.Screen
        name="UpdaterOrderHistory"
        component={UpdaterOrderHistoryScreen}
        options={{ title: t('updaterDashboard.orderHistory') }}
      />
      <Stack.Screen
        name="UpdaterPaymentMonitoring"
        component={UpdaterPaymentMonitoringScreen}
        options={{ title: t('updaterDashboard.paymentMonitoring') }}
      />
      <Stack.Screen
        name="UpdaterProblematicOrders"
        component={UpdaterProblematicOrdersScreen}
        options={{ title: t('updaterDashboard.problematicOrders') }}
      />
      <Stack.Screen
        name="UpdaterAnalytics"
        component={UpdaterAnalyticsScreen}
        options={{ title: t('dispatcherOps.updaterAnalyticsTitle') }}
      />
      <Stack.Screen
        name="UpdaterBulkOperations"
        component={UpdaterBulkOperationsScreen}
        options={{ title: t('dispatcherOps.openBulk') }}
      />
      <Stack.Screen
        name="UpdaterExport"
        component={UpdaterExportScreen}
        options={{ title: t('dispatcherOps.openExport') }}
      />
      <Stack.Screen
        name="UpdaterDriverDocuments"
        component={DispatcherDriverDocumentsScreen}
        initialParams={{ mode: 'updater' }}
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

export default UpdaterNavigator;
