/**
 * Release build API manzili.
 * Production builddan oldin haqiqiy server URL ni kiriting.
 */
export const PRODUCTION_API_BASE_URL = 'https://api.logistika.uz/api';

/** Release buildda obuna talab qilinadi — backend `SUBSCRIPTIONS_ENFORCED=True` bo'lishi kerak. */
export const PRODUCTION_SUBSCRIPTIONS_ENFORCED = true;

/** Release build uchun Sentry DSN. Bo'sh bo'lsa — error tracking o'chiriladi. */
export const PRODUCTION_SENTRY_DSN = '';

/** Sentry performance traces (0.0 – 1.0). */
export const PRODUCTION_SENTRY_TRACES_SAMPLE_RATE = 0.1;
