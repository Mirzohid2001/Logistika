import type { AppColors } from './colors';
import { createShadows } from './spacing';

/** Floating tab bar offset from the physical screen bottom (`tabBarStyle.bottom`). */
export const FLOATING_TAB_BAR_BOTTOM = 10;

export const getLogisticsHeaderOptions = (colors: AppColors) => ({
  headerStyle: {
    backgroundColor: colors.primaryDark,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 0,
  },
  headerTintColor: colors.textLight,
  headerTitleStyle: {
    fontWeight: '700' as const,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  headerBackTitleVisible: false as const,
});

export const getLogisticsTabOptions = (colors: AppColors) => {
  const shadows = createShadows(colors);
  return {
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textTertiary,
    tabBarStyle: {
      position: 'absolute' as const,
      left: 14,
      right: 14,
      bottom: FLOATING_TAB_BAR_BOTTOM,
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 0,
      height: 68,
      paddingBottom: 8,
      paddingTop: 10,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: `${colors.primary}14`,
      ...shadows.floating,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '700' as const,
      letterSpacing: 0.2,
      marginTop: 1,
    },
    tabBarItemStyle: {
      paddingTop: 1,
      paddingBottom: 2,
    },
    tabBarIconStyle: {
      marginTop: 2,
    },
    tabBarHideOnKeyboard: true,
  };
};
