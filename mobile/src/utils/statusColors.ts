import { colors as lightColors } from '../theme/colors';
import type { AppColors } from '../theme/colors';

export type BidStatusKey = 'accepted' | 'rejected' | 'cancelled' | 'pending';

export interface BidStatusStyle {
  key: BidStatusKey;
  color: string;
  bg: string;
}

export function getBidStatusStyle(
  bid: {
    is_accepted_by_client?: boolean;
    is_rejected_by_client?: boolean;
    is_rejected_by_driver?: boolean;
  },
  themeColors: AppColors = lightColors,
): BidStatusStyle {
  if (bid.is_accepted_by_client) {
    return { key: 'accepted', color: themeColors.success, bg: themeColors.successGlow };
  }
  if (bid.is_rejected_by_client) {
    return { key: 'rejected', color: themeColors.danger, bg: themeColors.dangerGlow };
  }
  if (bid.is_rejected_by_driver) {
    return { key: 'cancelled', color: themeColors.warning, bg: themeColors.warningGlow };
  }
  return { key: 'pending', color: themeColors.primary, bg: themeColors.primaryGlow };
}

export function getOrderStatusColor(code: string, themeColors: AppColors = lightColors): string {
  switch (code) {
    case 'new':
      return themeColors.status.new;
    case 'pending':
      return themeColors.status.pending;
    case 'approved':
    case 'approved_by_client':
      return themeColors.status.approved;
    case 'in_progress':
      return themeColors.warning;
    case 'in_transit':
      return themeColors.status.inProgress;
    case 'completed':
      return themeColors.status.completed;
    case 'cancelled':
      return themeColors.status.cancelled;
    case 'rejected':
      return themeColors.status.rejected;
    default:
      return themeColors.textSecondary;
  }
}
