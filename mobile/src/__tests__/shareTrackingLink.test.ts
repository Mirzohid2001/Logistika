import {
  buildTrackingShareDeepLink,
  buildTrackingShareMessage,
  parseTrackingShareToken,
} from '../utils/shareTrackingLink';

describe('shareTrackingLink', () => {
  const token = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

  it('parses raw uuid token', () => {
    expect(parseTrackingShareToken(token)).toBe(token);
  });

  it('parses api share url', () => {
    expect(parseTrackingShareToken(`https://api.logistika.uz/api/orders/share/${token}/`)).toBe(token);
  });

  it('parses deep link url', () => {
    expect(parseTrackingShareToken(`logistika://track/${token}`)).toBe(token);
  });

  it('builds deep link and share message', () => {
    expect(buildTrackingShareDeepLink(token)).toBe(`logistika://track/${token}`);
    const message = buildTrackingShareMessage(42, token, `https://api.example/share/${token}/`, {
      orderTitle: 'Order',
      shareHint: 'Track',
      appHint: 'App',
    });
    expect(message).toContain('#42');
    expect(message).toContain(`logistika://track/${token}`);
  });
});
