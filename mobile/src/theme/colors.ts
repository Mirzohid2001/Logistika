export const colors = {
  // Premium logistics palette
  primary: '#0A5BD6',
  primaryDark: '#0645A8',
  primaryLight: '#3B8BFF',
  primaryGlow: '#CFE4FF',
  secondary: '#0D7C8C',
  secondaryGlow: '#C8F0F4',
  success: '#059669',
  successGlow: '#D1FAE5',
  warning: '#D97706',
  warningGlow: '#FEF3C7',
  danger: '#DC2626',
  dangerGlow: '#FEE2E2',
  info: '#0284C7',
  logisticsAccent: '#EA580C',
  accentGlow: '#FFEDD5',

  background: '#F4F7FB',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#E9EFF7',
  surfaceMuted: '#F8FAFD',
  surfaceElevated: '#FFFFFF',

  text: '#0B1220',
  textSecondary: '#4B5C74',
  textTertiary: '#8B9BB0',
  textLight: '#FFFFFF',

  border: '#D6E0ED',
  borderLight: '#E8EEF6',
  borderDark: '#B8C8DB',

  shadow: '#0B1220',
  shadowTint: '#0A5BD6',

  overlay: 'rgba(11, 18, 32, 0.45)',
  overlayLight: 'rgba(11, 18, 32, 0.08)',

  cardBackground: '#FFFFFF',
  inputBackground: '#F8FAFD',
  /** Inner card / chip surface (maps to backgroundSecondary in dark mode). */
  surface: '#FFFFFF',
  /** Semantic alias for danger (SOS, validation). */
  error: '#DC2626',

  rating: '#FBBF24',
  favorite: '#EF4444',

  paymentProvider: {
    click: '#00D4FF',
    payme: '#FF6B00',
    uzum: '#7B2CBF',
  },

  /** QR / camera preview backdrop (always dark for contrast). */
  cameraBackground: '#000000',

  trustTier: {
    bronze: '#B87333',
    silver: '#8E9AAF',
    gold: '#D4A017',
    platinum: '#5B7C99',
  },

  status: {
    new: '#38BDF8',
    pending: '#F59E0B',
    approved: '#059669',
    inProgress: '#0A5BD6',
    completed: '#059669',
    cancelled: '#DC2626',
    rejected: '#DC2626',
  },
};

export type AppColors = typeof colors;
