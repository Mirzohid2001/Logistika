import {Linking, Settings} from 'react-native';

export const appLinkingConfig = {
  prefixes: ['logistika://'],
  async getInitialURL() {
    if (__DEV__) {
      const demoInitialURL = Settings.get('demoInitialURL');
      if (typeof demoInitialURL === 'string' && demoInitialURL.startsWith('logistika://')) {
        Settings.set({demoInitialURL: ''});
        return demoInitialURL;
      }
    }
    return Linking.getInitialURL();
  },
  config: {
    screens: {
      PublicTrackingShare: 'track/:token',
      OpenTrackingLink: 'open-track',
      Auth: {
        path: 'auth',
        screens: {
          Login: 'login',
          Register: 'register',
          TelegramAuth: 'telegram',
          ForgotPassword: 'forgot-password',
        },
      },
      Main: {
        path: 'main',
        screens: {
          ClientStack: {
            screens: {
              ClientOrderDetail: 'client/orders/:id',
              ClientOrderTracking: 'client/orders/:id/tracking',
              Bids: 'client/bids',
              AdvertisementDetail: 'client/ads/:id',
            },
          },
          DriverStack: {
            screens: {
              OrderDetail: 'driver/orders/:id',
              OrderTracking: 'driver/orders/:id/tracking',
              AdvertisementDetail: 'driver/ads/:id',
              MyBids: 'driver/bids',
            },
          },
          DispatcherStack: {
            screens: {
              DispatcherOrderDetail: 'dispatcher/orders/:id',
              DispatcherMonitoring: 'dispatcher/monitoring',
              DispatcherDriverDocuments: 'dispatcher/driver-documents',
              StaffComplaints: 'dispatcher/complaints',
            },
          },
        },
      },
      DriverDocuments: 'driver-documents',
      UploadDocuments: 'upload-documents',
      ChatDetail: 'chat/:id',
      ChatList: 'chats',
      NotificationSettings: 'notification-settings',
      ReviewsHistory: 'reviews',
      ComplaintsHistory: 'complaints',
      CompanyMembers: 'company/members',
    },
  },
};

export const APP_LINKING_PREFIXES = appLinkingConfig.prefixes;
