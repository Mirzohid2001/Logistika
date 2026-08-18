import * as Sentry from '@sentry/react-native';

import { PRODUCTION_SENTRY_DSN, PRODUCTION_SENTRY_TRACES_SAMPLE_RATE } from './production';

let initialized = false;

export function initSentry(): void {
  if (initialized || __DEV__) {
    return;
  }

  const dsn = PRODUCTION_SENTRY_DSN.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: 'production',
    enableAutoSessionTracking: true,
    tracesSampleRate: PRODUCTION_SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
  });

  initialized = true;
}

export function captureAppError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__ || !initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }
    Sentry.captureMessage(typeof error === 'string' ? error : 'Unknown app error');
  });
}

export { Sentry };
