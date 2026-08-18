import type { AppColors } from './colors';

/** Theme-aware chart colors (dark/light). */
export function getChartPalette(colors: AppColors): string[] {
  return [
    colors.success,
    colors.warning,
    colors.danger,
    colors.secondary,
    colors.info,
    colors.logisticsAccent,
  ];
}
