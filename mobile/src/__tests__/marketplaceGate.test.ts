import { ErrorCode, errorService } from '../services/errorService';
import { isDocumentExpiredError, isSubscriptionGateError } from '../utils/marketplaceGate';

describe('marketplaceGate subscription routing', () => {
  it('detects subscription_required from backend 403 payload', () => {
    const error = {
      response: {
        status: 403,
        data: {
          error: 'Bepul sinov limiti tugadi. Obuna kerak.',
          code: 'subscription_required',
        },
      },
    };
    const parsed = errorService.parseError(error);
    expect(parsed.code).toBe(ErrorCode.SUBSCRIPTION_REQUIRED);
    expect(isSubscriptionGateError(error)).toBe(true);
  });

  it('detects payment_required gate errors', () => {
    const error = {
      response: {
        status: 400,
        data: {
          error: 'To\'lov talab qilinadi',
          code: 'payment_required',
        },
      },
    };
    expect(isSubscriptionGateError(error)).toBe(true);
  });

  it('does not treat generic 403 as subscription gate', () => {
    const error = {
      response: {
        status: 403,
        data: {
          error: 'Haydovchi tasdiqlanmagan',
        },
      },
    };
    expect(isSubscriptionGateError(error)).toBe(false);
  });

  it('detects document_expired eligibility errors', () => {
    const error = {
      response: {
        status: 403,
        data: {
          error: 'Hujjat muddati tugagan: Driver License',
          code: 'document_expired',
        },
      },
    };
    expect(isDocumentExpiredError(error)).toBe(true);
    expect(isSubscriptionGateError(error)).toBe(false);
    expect(errorService.parseError(error).code).toBe(ErrorCode.DOCUMENT_EXPIRED);
  });
});
