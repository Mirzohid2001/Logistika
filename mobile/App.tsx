import React, { useEffect } from 'react';
import {StatusBar, LogBox} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import {AuthProvider} from './src/context/AuthContext';
import { NotificationBadgeProvider } from './src/context/NotificationBadgeContext';
import { ChatBadgeProvider } from './src/context/ChatBadgeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { pushNotificationService } from './src/services/pushNotificationService';
import { GlobalToast } from './src/components/GlobalToast';
import { OfflineBanner } from './src/components/OfflineBanner';
import { ThemeProvider } from './src/context/ThemeContext';
import { useAppTheme } from './src/theme/useAppTheme';

// Ignore ViewPropTypes deprecation warning
LogBox.ignoreLogs([
  'ViewPropTypes will be removed',
  'ViewPropTypes',
  'deprecated-react-native-prop-types',
  'PropTypes',
  // Ignore iOS network socket warnings (harmless)
  /nw_protocol_socket/,
  /SO_NOWAKEFROMSLEEP/,
  /setsockopt/,
  // Ignore iOS Core Audio warnings (harmless)
  'AddInstanceForFactory',
  'No factory registered',
]);

// Override console methods to filter warnings
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

const shouldIgnore = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('viewproptypes') ||
    lowerMessage.includes('proptypes') ||
    lowerMessage.includes('nw_protocol_socket') ||
    lowerMessage.includes('so_nowakefromsleep') ||
    lowerMessage.includes('setsockopt') ||
    lowerMessage.includes('addinstanceforfactory') ||
    lowerMessage.includes('no factory registered') ||
    lowerMessage.includes('invalid argument')
  );
};

const isHandledClientError = (args: any[], message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  const hasRateLimitedInArgs = args.some((arg) => {
    if (!arg) return false;
    if (typeof arg === 'string') {
      const text = arg.toLowerCase();
      return text.includes('rate_limited') || text.includes('statuscode') && text.includes('429');
    }
    if (typeof arg === 'object') {
      const status =
        (arg as any).statusCode ??
        (arg as any).status ??
        (arg as any).response?.status ??
        (arg as any).originalError?.response?.status;
      const code =
        (arg as any).code ??
        (arg as any).response?.data?.code ??
        (arg as any).originalError?.response?.data?.code;
      if (status === 429) return true;
      if (typeof code === 'string' && code.toLowerCase() === 'rate_limited') return true;
    }
    return false;
  });
  const isHandledValidation =
    lowerMessage.includes('validation_error') ||
    lowerMessage.includes('already have an active bid') ||
    lowerMessage.includes("to'liq to'lov") ||
    lowerMessage.includes("to'lov qilinmagan");
  const hasSubscriptionRequiredInArgs = args.some((arg) => {
    if (!arg || typeof arg !== 'object') return false;
    const code =
      (arg as any).code ??
      (arg as any).response?.data?.code ??
      (arg as any).originalError?.response?.data?.code;
    return code === 'subscription_required';
  });
  return (
    hasRateLimitedInArgs ||
    hasSubscriptionRequiredInArgs ||
    lowerMessage.includes('"statuscode":429') ||
    lowerMessage.includes('"code":"rate_limited"') ||
    lowerMessage.includes('"code":"subscription_required"') ||
    lowerMessage.includes('subscription_required') ||
    lowerMessage.includes('faol obuna talab qilinadi') ||
    lowerMessage.includes('expected available in') ||
    isHandledValidation
  );
};

console.error = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldIgnore(message)) {
    return; // Ignore these warnings
  }
  if (isHandledClientError(args, message)) {
    originalWarn.apply(console, args);
    return;
  }
  originalError.apply(console, args);
};

console.warn = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldIgnore(message)) {
    return; // Ignore these warnings
  }
  originalWarn.apply(console, args);
};

console.log = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldIgnore(message)) {
    return; // Ignore these warnings
  }
  originalLog.apply(console, args);
};

const AppShell = () => {
  const { colors, isDark } = useAppTheme();

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <OfflineBanner />
      <AppNavigator />
      <GlobalToast />
    </>
  );
};

const App = () => {
  useEffect(() => {
    pushNotificationService.initialize();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <NotificationBadgeProvider>
            <ChatBadgeProvider>
              <AppShell />
            </ChatBadgeProvider>
          </NotificationBadgeProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;


