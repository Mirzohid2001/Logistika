import { errorService, ErrorCode, getApiErrorMessage } from '../services/errorService';

describe('errorService payment_required', () => {
  it('maps backend subscription_required code on 403', () => {
    const parsed = errorService.parseError({
      response: {
        status: 403,
        data: {
          code: 'subscription_required',
          error: 'Obuna kerak',
        },
      },
    });
    expect(parsed.code).toBe(ErrorCode.SUBSCRIPTION_REQUIRED);
    expect(parsed.message).toBe('Obuna kerak');
  });

  it('maps backend payment_required code', () => {
    const parsed = errorService.parseError({
      response: {
        status: 400,
        data: {
          code: 'payment_required',
          error: 'To\'lov talab qilinadi',
        },
      },
    });
    expect(parsed.code).toBe(ErrorCode.PAYMENT_REQUIRED);
    expect(parsed.message).toBe('To\'lov talab qilinadi');
  });

  it('treats payment_required as expected business error', () => {
    const parsed = errorService.parseError({
      response: {
        status: 400,
        data: { code: 'payment_required', error: 'Pay first' },
      },
    });
    expect(errorService.isExpectedError(parsed)).toBe(true);
  });

  it('maps service_fee_required and treats it as an expected account gate', () => {
    const parsed = errorService.parseError({
      response: {
        status: 403,
        data: {
          code: 'service_fee_required',
          error: 'Avval xizmat to\'lovini to\'lang',
        },
      },
    });
    expect(parsed.code).toBe(ErrorCode.SERVICE_FEE_REQUIRED);
    expect(parsed.message).toBe('Avval xizmat to\'lovini to\'lang');
    expect(errorService.isExpectedError(parsed)).toBe(true);
  });

  it('maps document_expired 403 to DOCUMENT_EXPIRED', () => {
    const parsed = errorService.parseError({
      response: {
        status: 403,
        data: {
          code: 'document_expired',
          error: 'Hujjat muddati tugagan',
        },
      },
    });
    expect(parsed.code).toBe(ErrorCode.DOCUMENT_EXPIRED);
    expect(parsed.message).toBe('Hujjat muddati tugagan');
    expect(errorService.isExpectedError(parsed)).toBe(true);
  });

  it('treats validation_error as expected so LogBox is not shown', () => {
    const parsed = errorService.parseError({
      response: {
        status: 400,
        data: { code: 'validation_error', error: 'Avval obyektga yetib boring.' },
      },
    });
    expect(parsed.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(errorService.isExpectedError(parsed)).toBe(true);
  });

  it('getApiErrorMessage reads AppError message', () => {
    const message = getApiErrorMessage({
      code: ErrorCode.PAYMENT_REQUIRED,
      message: 'Mijoz to\'lov qilmagan',
    });
    expect(message).toBe('Mijoz to\'lov qilmagan');
  });
});
