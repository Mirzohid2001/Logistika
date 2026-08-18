import type { AppColors } from './colors';

export type BannerVariant = 'pending' | 'rejected' | 'required';

export interface BannerPalette {
  bg: string;
  border: string;
  title: string;
  message: string;
}

export function getVerificationBannerPalette(
  colors: AppColors,
  variant: BannerVariant,
): BannerPalette {
  if (variant === 'pending') {
    return {
      bg: colors.primaryGlow,
      border: colors.primary,
      title: colors.primaryDark,
      message: colors.primary,
    };
  }
  if (variant === 'rejected') {
    return {
      bg: colors.dangerGlow,
      border: colors.danger,
      title: colors.danger,
      message: colors.danger,
    };
  }
  return {
    bg: colors.warningGlow,
    border: colors.warning,
    title: colors.warning,
    message: colors.warning,
  };
}
