import { Platform, Vibration } from 'react-native';
import { apiService } from './api';
import {
  getPrimaryRole,
  navigateFromPushData,
  UserRole,
} from '../utils/notificationNavigation';
import { User } from '../types';
import { authService } from './authService';
import { deviceService } from './deviceService';
import { handleStopAlertEvent, isHighPriorityNotificationType } from '../utils/trackingAlerts';

// Dynamic imports to handle missing packages
let messaging: any = null;
let notifee: any = null;
let AndroidImportance: any = null;
let EventType: any = null;
let firebaseApp: any = null;

const ALERT_CHANNEL_ID = 'tracking-alerts';
const SKIP_OPTIONAL_PUSH_BOOTSTRAP = Platform.OS === 'ios' && __DEV__;

if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
  try {
    // Initialize Firebase App first
    firebaseApp = require('@react-native-firebase/app').default;

    // Check if Firebase is already initialized
    try {
      firebaseApp.app();
    } catch (error) {
      if (__DEV__) {
        console.log('[Push] Firebase native config kutilmoqda (GoogleService-Info.plist / google-services.json)');
      }
    }

    messaging = require('@react-native-firebase/messaging').default;
    const notifeeModule = require('@notifee/react-native');
    notifee = notifeeModule.default;
    AndroidImportance = notifeeModule.AndroidImportance;
    EventType = notifeeModule.EventType;
  } catch (error) {
    console.warn('Firebase or Notifee packages not installed. Push notifications will be limited.');
  }
}

class PushNotificationService {
  private fcmToken: string | null = null;
  private isFirebaseAvailable: boolean = false;
  private isFirebaseConfigured: boolean = false;
  private hasShownConfigWarning: boolean = false;

  constructor() {
    this.isFirebaseAvailable = messaging !== null && notifee !== null;
    this.isFirebaseConfigured = this.checkFirebaseConfigured();
  }

  private checkFirebaseConfigured(): boolean {
    if (!this.isFirebaseAvailable || !firebaseApp) {
      return false;
    }
    try {
      firebaseApp.app();
      return true;
    } catch (_error) {
      return false;
    }
  }

  private warnFirebaseNotConfigured(context?: string): void {
    if (this.hasShownConfigWarning) {
      return;
    }
    this.hasShownConfigWarning = true;
    const message =
      `Firebase native config topilmadi${context ? ` (${context})` : ''}. ` +
      "Push notification o'chiriladi. iOS: GoogleService-Info.plist, Android: google-services.json";
    if (__DEV__) {
      console.log(`[Push] ${message}`);
      return;
    }
    console.warn(message);
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isFirebaseAvailable) {
      if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
        console.warn('Firebase messaging not available');
      }
      return false;
    }
    if (!this.isFirebaseConfigured) {
      this.warnFirebaseNotConfigured('requestPermission');
      return false;
    }

    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Push notification permission granted');
        return true;
      }
      return false;
    } catch (error: any) {
      // Check if error is about Firebase not being initialized
      if (error?.message?.includes('No Firebase App') || error?.message?.includes('has been created')) {
        this.warnFirebaseNotConfigured('requestPermission');
        return false;
      }
      console.error('Error requesting permission:', error);
      return false;
    }
  }

  async getFCMToken(): Promise<string | null> {
    if (!this.isFirebaseAvailable) {
      if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
        console.warn('Firebase messaging not available');
      }
      return null;
    }
    if (!this.isFirebaseConfigured) {
      this.warnFirebaseNotConfigured('getFCMToken');
      return null;
    }

    try {
      if (!this.fcmToken) {
        this.fcmToken = await messaging().getToken();
      }
      return this.fcmToken;
    } catch (error: any) {
      // Check if error is about Firebase not being initialized
      if (error?.message?.includes('No Firebase App') || error?.message?.includes('has been created')) {
        this.warnFirebaseNotConfigured('getFCMToken');
        return null;
      }
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  async updateFCMToken(user?: User | null): Promise<void> {
    if (!this.isFirebaseAvailable) {
      if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
        console.warn('Firebase messaging not available, skipping FCM token update');
      }
      return;
    }

    const resolvedUser = user ?? (await authService.getStoredUser());
    if (resolvedUser && !userCanAccessPlatform(resolvedUser)) {
      return;
    }

    try {
      const token = await this.getFCMToken();
      if (token) {
        await apiService.post('/auth/fcm-token/', {
          fcm_token: token,
          device_id: await deviceService.getDeviceId(),
          platform: Platform.OS,
        });
        console.log('FCM token updated successfully');
      }
    } catch (error: any) {
      if (error?.code === 'subscription_required') {
        return;
      }
      console.warn('FCM token update skipped:', error?.message || error);
    }
  }

  async setupNotificationHandlers() {
    if (!this.isFirebaseAvailable) {
      if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
        console.warn('Firebase messaging not available, skipping notification handlers');
      }
      return;
    }

    try {
      // Foreground message handler
      messaging().onMessage(async (remoteMessage) => {
        console.log('Foreground message:', remoteMessage);

        const { notification, data } = remoteMessage;
        const payload = (data || {}) as Record<string, string>;
        const type = payload.type;

        if (type === 'stop_alert') {
          handleStopAlertEvent(
            {
              type,
              order_id: payload.order_id,
              level: payload.alert_level,
              message: payload.body || notification?.body,
            },
            { vibrate: true },
          );
        } else if (type === 'route_deviation') {
          Vibration.vibrate([0, 250, 120, 250]);
        }

        const title = notification?.title || payload.title || 'Yangi xabar';
        const body = notification?.body || payload.body || '';
        if (title || body) {
          await this.displayNotification(title, body, payload, type);
        }
      });

      if (notifee && EventType) {
        notifee.onForegroundEvent(({ type, detail }: { type: number; detail: any }) => {
          if (type === EventType.PRESS) {
            this.handleNotificationPress(detail.notification?.data);
          }
        });
      }

      // Background message handler
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        console.log('Background message:', remoteMessage);
      });

      // Notification opened handler
      messaging().onNotificationOpenedApp((remoteMessage) => {
        console.log('Notification opened app:', remoteMessage);
        this.handleNotificationPress(remoteMessage.data);
      });

      // Check if app was opened from notification
      messaging()
        .getInitialNotification()
        .then((remoteMessage) => {
          if (remoteMessage) {
            console.log('App opened from notification:', remoteMessage);
            this.handleNotificationPress(remoteMessage.data);
          }
        });
    } catch (error) {
      console.error('Error setting up notification handlers:', error);
    }
  }

  async displayNotification(
    title: string,
    body: string,
    data: any = {},
    notificationType?: string,
  ): Promise<void> {
    if (!this.isFirebaseAvailable || !notifee) {
      if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
        console.warn('Notifee not available, cannot display notification');
      }
      return;
    }

    try {
      const isAlert = isHighPriorityNotificationType(notificationType || data?.type);
      if (Platform.OS === 'android') {
        const defaultChannelId = await notifee.createChannel({
          id: 'default',
          name: 'Default Channel',
          importance: AndroidImportance.HIGH,
          sound: 'default',
        });
        const alertChannelId = await notifee.createChannel({
          id: ALERT_CHANNEL_ID,
          name: 'Tracking alerts',
          importance: AndroidImportance.HIGH,
          sound: 'default',
          vibration: true,
        });
        const channelId = isAlert ? alertChannelId : defaultChannelId;

        await notifee.displayNotification({
          title,
          body,
          data,
          android: {
            channelId,
            importance: AndroidImportance.HIGH,
            sound: 'default',
            vibrationPattern: isAlert ? [300, 500, 300, 500] : undefined,
            pressAction: {
              id: 'default',
            },
          },
        });
      } else {
        await notifee.displayNotification({
          title,
          body,
          data,
          ios: {
            sound: 'default',
            critical: isAlert,
            interruptionLevel: isAlert ? 'timeSensitive' : 'active',
          },
        });
      }
    } catch (error) {
      console.error('Error displaying notification:', error);
    }
  }

  private navigationRef: any = null;
  private userRole: UserRole = null;
  private currentUser: User | null = null;

  setNavigationRef(ref: any): void {
    this.navigationRef = ref;
  }

  setUser(user: User | null): void {
    this.currentUser = user;
    this.userRole = getPrimaryRole(user);
  }

  handleNotificationPress(data: any): void {
    if (!this.navigationRef) {
      console.log('Navigation ref not set');
      return;
    }
    if (this.currentUser && !userCanAccessPlatform(this.currentUser)) {
      return;
    }

    try {
      navigateFromPushData(this.navigationRef, data || {}, this.userRole);
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  }

  async initialize(): Promise<void> {
    if (!this.isFirebaseAvailable) {
      if (!SKIP_OPTIONAL_PUSH_BOOTSTRAP) {
        console.warn('Firebase messaging not available. Please install: npm install @react-native-firebase/app @react-native-firebase/messaging @notifee/react-native');
      }
      return;
    }
    if (!this.isFirebaseConfigured) {
      this.warnFirebaseNotConfigured('initialize');
      return;
    }

    try {
      const hasPermission = await this.requestPermission();
      if (hasPermission) {
        await this.setupNotificationHandlers();
        await this.updateFCMToken();
      }
    } catch (error: any) {
      // Check if error is about Firebase not being initialized
      if (error?.message?.includes('No Firebase App') || error?.message?.includes('has been created')) {
        this.warnFirebaseNotConfigured('initialize');
        return;
      }
      console.error('Error initializing push notifications:', error);
    }
  }
}

export const pushNotificationService = new PushNotificationService();
