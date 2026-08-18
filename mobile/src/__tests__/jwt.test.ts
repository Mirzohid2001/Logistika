import { decodeJwtPayload, getTokenExpiryMs, isTokenExpiringSoon } from '../utils/jwt';

const makeToken = (payload: Record<string, unknown>) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
};

describe('jwt utils', () => {
  it('decodes exp claim', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeToken({ exp });
    expect(getTokenExpiryMs(token)).toBe(exp * 1000);
    expect(decodeJwtPayload(token)?.exp).toBe(exp);
  });

  it('detects soon-to-expire tokens', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = makeToken({ exp });
    expect(isTokenExpiringSoon(token, 5 * 60 * 1000)).toBe(true);
  });

  it('keeps fresh tokens', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeToken({ exp });
    expect(isTokenExpiringSoon(token, 5 * 60 * 1000)).toBe(false);
  });
});
