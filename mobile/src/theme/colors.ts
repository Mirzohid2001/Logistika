export const colors = {
  // Premium Navigation — graphite surfaces with a precise turquoise signal.
  primary: '#18C5C8',
  primaryDark: '#0D9498',
  primaryLight: '#58DADD',
  primaryGlow: '#D7F8F8',
  secondary: '#20A98F',
  secondaryGlow: '#D9F5EE',
  success: '#22A979',
  successGlow: '#D1FAE5',
  warning: '#D98B3A',
  warningGlow: '#FEF3C7',
  danger: '#E25555',
  dangerGlow: '#FEE2E2',
  info: '#35A8D4',
  logisticsAccent: '#F2A65A',
  accentGlow: '#FFF0DE',

  background: '#F1F5F5',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#E5ECEC',
  surfaceMuted: '#F7F9F9',
  surfaceElevated: '#FFFFFF',

  text: '#102027',
  textSecondary: '#51656E',
  textTertiary: '#85969D',
  textLight: '#FFFFFF',
  onPrimary: '#071719',

  border: '#CAD7D9',
  borderLight: '#E1E8E9',
  borderDark: '#AFC0C3',

  shadow: '#071319',
  shadowTint: '#18C5C8',

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
    new: '#35A8D4',
    pending: '#F59E0B',
    approved: '#22A979',
    inProgress: '#18C5C8',
    completed: '#22A979',
    cancelled: '#E25555',
    rejected: '#E25555',
  },
};

export type AppColors = typeof colors;
