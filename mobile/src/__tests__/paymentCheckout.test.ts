import { extractCheckoutUrlFromGateway, extractPaymentCheckoutUrl, isPaymentAwaitingCheckout } from '../utils/paymentCheckout';
import type { Payment } from '../types';

describe('paymentCheckout', () => {
  it('prefers checkout_url on payment', () => {
    const payment = {
      id: 1,
      amount: 1000,
      currency: 'UZS',
      payment_method: 'click',
      payment_status: 'processing',
      checkout_url: 'https://pay.test/1',
    } as Payment;
    expect(extractPaymentCheckoutUrl(payment)).toBe('https://pay.test/1');
    expect(isPaymentAwaitingCheckout(payment)).toBe(true);
  });

  it('extracts nested gateway url', () => {
    expect(
      extractCheckoutUrlFromGateway({
        data: { redirect_url: 'https://pay.test/nested' },
      }),
    ).toBe('https://pay.test/nested');
  });

  it('returns false when completed', () => {
    const payment = {
      id: 2,
      amount: 1000,
      currency: 'UZS',
      payment_method: 'click',
      payment_status: 'completed',
      checkout_url: 'https://pay.test/2',
    } as Payment;
    expect(isPaymentAwaitingCheckout(payment)).toBe(false);
  });
});
