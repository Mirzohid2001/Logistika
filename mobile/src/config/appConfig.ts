import { NativeModules, Platform } from 'react-native';
import { PRODUCTION_API_BASE_URL, PRODUCTION_SUBSCRIPTIONS_ENFORCED } from './production';

/**
 * Ixtiyoriy override — CI, release yoki simulator test uchun.
 * Bo'sh qoldiring — Metro/Debugda avtomatik local backend ishlatiladi.
 */
export const PROD_API_BASE_URL = '';

/** Separate local API port so Logistika can run alongside another project. */
export const DEV_API_PORT = 18083;

/** Dev buildda o'chirilgan; release buildda `production.ts` dan olinadi. */
export const SUBSCRIPTIONS_ENFORCED = __DEV__ ? false : PRODUCTION_SUBSCRIPTIONS_ENFORCED;

const PLACEHOLDER_MARKERS = ['YOUR_DOMAIN', 'CHANGE_ME', 'example.com'];

function getMetroScriptUrl(): string {
  return NativeModules.SourceCode?.scriptURL ?? '';
}

/** Metro bundler orqali yuklangan bundle (Xcode Release + npm start ham kiradi). */
export function isRunningFromMetroBundler(): boolean {
  const scriptURL = getMetroScriptUrl();
  if (!scriptURL) {
    return false;
  }
  return (
    scriptURL.includes('localhost') ||
    scriptURL.includes('127.0.0.1') ||
    scriptURL.includes(':8081') ||
    scriptURL.includes(':8082') ||
    scriptURL.includes(':8083')
  );
}

export function shouldUseLocalApi(): boolean {
  return __DEV__ || isRunningFromMetroBundler();
}

function resolveDevApiHost(): string {
  const scriptURL = getMetroScriptUrl();
  const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
  const metroHost = match?.[1];

  if (metroHost && metroHost !== 'localhost' && metroHost !== '127.0.0.1') {
    // Fizik qurilma: Metro Mac IP manzilini ko'rsatadi
    return metroHost;
  }

  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

function getDevApiBaseUrl(): string {
  return `http://${resolveDevApiHost()}:${DEV_API_PORT}/api`;
}

function resolveProductionApiUrl(): string {
  return (PROD_API_BASE_URL || PRODUCTION_API_BASE_URL).replace(/\/$/, '');
}

function isProductionUrlConfigured(url: string): boolean {
  if (!url) {
    return false;
  }
  if (url.startsWith('http://127.0.0.1') || url.startsWith('http://10.0.2.2') || url.startsWith('http://localhost')) {
    return true;
  }
  if (!url.startsWith('https://')) {
    return false;
  }
  return !PLACEHOLDER_MARKERS.some((marker) => url.includes(marker));
}

export function getApiBaseUrl(): string {
  const override = PROD_API_BASE_URL?.replace(/\/$/, '');
  if (override) {
    return override;
  }
  if (shouldUseLocalApi()) {
    return getDevApiBaseUrl();
  }
  const url = resolveProductionApiUrl();
  if (!isProductionUrlConfigured(url)) {
    throw new Error(
      'Release build: src/config/production.ts ichida PRODUCTION_API_BASE_URL ni sozlang ' +
        '(masalan https://api.logistika.uz/api) yoki appConfig.ts da PROD_API_BASE_URL override qiling',
    );
  }
  return url;
}

export function getMediaBaseUrl(): string {
  const api = getApiBaseUrl();
  return api.replace(/\/api\/?$/, '');
}

export function getWsBaseUrl(): string {
  const mediaBase = getMediaBaseUrl();
  const protocol = mediaBase.startsWith('https') ? 'wss' : 'ws';
  const host = mediaBase.replace(/^https?:\/\//, '');
  return `${protocol}://${host}`;
}

export function getApiDebugInfo(): string {
  return JSON.stringify({
    api: getApiBaseUrl(),
    dev: __DEV__,
    metro: isRunningFromMetroBundler(),
    scriptURL: getMetroScriptUrl(),
  });
}
