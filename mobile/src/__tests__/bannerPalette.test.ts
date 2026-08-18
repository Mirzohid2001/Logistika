import type { AppColors } from '../theme/colors';
import { getVerificationBannerPalette } from '../theme/bannerPalette';

describe('bannerPalette', () => {
  const colors = {
    primaryGlow: '#CFE4FF',
    primary: '#0A5BD6',
    primaryDark: '#0645A8',
    dangerGlow: '#FEE2E2',
    danger: '#DC2626',
    warningGlow: '#FEF3C7',
    warning: '#D97706',
  } as AppColors;

  it('returns themed pending palette', () => {
    expect(getVerificationBannerPalette(colors, 'pending')).toEqual({
      bg: '#CFE4FF',
      border: '#0A5BD6',
      title: '#0645A8',
      message: '#0A5BD6',
    });
  });

  it('returns themed rejected palette', () => {
    expect(getVerificationBannerPalette(colors, 'rejected').bg).toBe('#FEE2E2');
  });
});
