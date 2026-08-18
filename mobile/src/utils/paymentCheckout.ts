import { Payment } from '../types';

const URL_KEYS = ['checkout_url', 'payment_url', 'redirect_url', 'pay_url', 'url', 'link'] as const;

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

export function extractPaymentCheckoutUrl(payment: Payment | null | undefined): string | null {
  if (!payment) return null;
  if (isHttpUrl(payment.checkout_url)) {
    return payment.checkout_url;
  }
  return extractCheckoutUrlFromGateway(payment.gateway_response);
}

export function extractCheckoutUrlFromGateway(gateway: unknown): string | null {
  if (!gateway || typeof gateway !== 'object') {
    return null;
  }
  const record = gateway as Record<string, unknown>;
  for (const key of URL_KEYS) {
    if (isHttpUrl(record[key])) {
      return record[key] as string;
    }
  }
  for (const nestedKey of ['result', 'data', 'payment', 'checkout']) {
    const nested = record[nestedKey];
    if (nested && typeof nested === 'object') {
      const found = extractCheckoutUrlFromGateway(nested);
      if (found) return found;
    }
  }
  return null;
}

export function isPaymentAwaitingCheckout(payment: Payment): boolean {
  const pending = payment.payment_status === 'pending' || payment.payment_status === 'processing';
  return pending && Boolean(extractPaymentCheckoutUrl(payment));
}
