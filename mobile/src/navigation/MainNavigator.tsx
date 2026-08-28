import React, { useMemo } from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {getFocusedRouteNameFromRoute} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {useAuth} from '../context/AuthContext';
import {useNotificationBadge} from '../context/NotificationBadgeContext';
import {useChatBadge} from '../context/ChatBadgeContext';
import {useTranslation} from '../hooks/useTranslation';
import ClientNavigator from './ClientNavigator';
import DriverNavigator from './DriverNavigator';
import DispatcherNavigator from './DispatcherNavigator';
import UpdaterNavigator from './UpdaterNavigator';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ChatListScreen from '../screens/ChatListScreen';
import { getLogisticsTabOptions } from '../theme/navigation';
import { useAppTheme } from '../theme/useAppTheme';

const Tab = createBottomTabNavigator();

const MainNavigator = () => {
  const {user, activeMarketplaceRole} = useAuth();
  const {t} = useTranslation();
  const { unreadCount } = useNotificationBadge();
  const { unreadCount: chatUnreadCount } = useChatBadge();
  const insets = useSafeAreaInsets();

  const getPrimaryRole = () => {
    if (!user) {return null;}
    if (user.is_dispatcher) {return 'dispatcher';}
    if (user.is_updater) {return 'updater';}
    if (activeMarketplaceRole) {return activeMarketplaceRole;}
    if (user.account?.role) {return user.account.role;}
    if (user.marketplace_role) {return user.marketplace_role;}
    if (user.is_driver) {return 'driver';}
    if (user.is_client) {return 'client';}
    return null;
  };

  const primaryRole = getPrimaryRole();
  const { colors } = useAppTheme();
  const tabOptions = useMemo(() => getLogisticsTabOptions(colors), [colors]);
  const tabBarHeight = 64 + Math.max(insets.bottom, 8);
  const showMarketplaceChats = primaryRole === 'client' || primaryRole === 'driver' || primaryRole === 'dispatcher';
  const chatBadge = chatUnreadCount > 0 ? (chatUnreadCount > 99 ? '99+' : chatUnreadCount) : undefined;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        ...tabOptions,
        tabBarStyle: {
          ...tabOptions.tabBarStyle,
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
      }}>
      {primaryRole === 'client' && (
        <Tab.Screen
          name="ClientStack"
          component={ClientNavigator}
          options={({route}) => ({
            title: t('dashboard.home'),
            tabBarAccessibilityLabel: t('dashboard.home'),
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="home" size={size} color={color} />
            ),
            tabBarStyle:
              getFocusedRouteNameFromRoute(route) === 'ClientOrderTracking'
                ? {display: 'none'}
                : undefined,
          })}
        />
      )}
      {primaryRole === 'driver' && (
        <Tab.Screen
          name="DriverStack"
          component={DriverNavigator}
          options={{
            title: t('dashboard.home'),
            tabBarAccessibilityLabel: t('dashboard.home'),
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="home" size={size} color={color} />
            ),
          }}
        />
      )}
      {primaryRole === 'dispatcher' && (
        <Tab.Screen
          name="DispatcherStack"
          component={DispatcherNavigator}
          options={{
            title: t('profile.dispatcher'),
            tabBarAccessibilityLabel: t('profile.dispatcher'),
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="assignment" size={size} color={color} />
            ),
          }}
        />
      )}
      {primaryRole === 'updater' && (
        <Tab.Screen
          name="UpdaterStack"
          component={UpdaterNavigator}
          options={{
            title: t('profile.updater'),
            tabBarAccessibilityLabel: t('profile.updater'),
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="update" size={size} color={color} />
            ),
          }}
        />
      )}
      {showMarketplaceChats && (
        <Tab.Screen
          name="Chats"
          component={ChatListScreen}
          options={{
            title: t('chat.title'),
            tabBarAccessibilityLabel: t('chat.title'),
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="chat" size={size} color={color} />
            ),
            tabBarBadge: chatBadge,
            tabBarBadgeStyle: {
              backgroundColor: colors.danger,
              fontSize: 11,
            },
          }}
        />
      )}
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: t('notifications.title'),
          tabBarAccessibilityLabel: t('notifications.title'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="notifications" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.danger,
            fontSize: 11,
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('profile.title'),
          tabBarAccessibilityLabel: t('profile.title'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default MainNavigator;
