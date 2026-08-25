import type { Order, OrderRouteStop } from '../types';

const STATUS_PRIORITY: Record<string, number> = {
  in_transit: 10,
  in_progress: 20,
  approved_by_client: 30,
  pending: 40,
  new: 50,
  stopped: 60,
  completed: 900,
  cancelled: 910,
  rejected: 920,
};

export const DRIVER_WORKFLOW_STEPS = [
  'pending',
  'approved_by_client',
  'in_progress',
  'in_transit',
  'completed',
] as const;

export type DriverWorkflowStep = (typeof DRIVER_WORKFLOW_STEPS)[number];

export type OrderNextAction = {
  titleKey: string;
  hintKey: string;
  tone: 'action' | 'wait';
  ctaKey?: string;
  secondaryCtaKey?: string;
};

function firstPickup(stops?: OrderRouteStop[] | null): OrderRouteStop | undefined {
  return [...(stops || [])]
    .filter((stop) => stop.stop_type === 'pickup')
    .sort((a, b) => a.sequence - b.sequence)[0];
}

export function sortOrdersByWorkflowPriority(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status.code] ?? 500;
    const pb = STATUS_PRIORITY[b.status.code] ?? 500;
    if (pa !== pb) {return pa - pb;}
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });
}

export function getDriverWorkflowStep(statusCode?: string): DriverWorkflowStep {
  if (statusCode === 'completed') {return 'completed';}
  if (statusCode === 'in_transit') {return 'in_transit';}
  if (statusCode === 'in_progress') {return 'in_progress';}
  if (statusCode === 'approved_by_client') {return 'approved_by_client';}
  return 'pending';
}

export function getDriverNextAction(order: Pick<
  Order,
  | 'status'
  | 'route_stops'
  | 'proof_of_delivery'
  | 'client_delivery_confirmed'
  | 'client_payment_confirmed'
  | 'client_paid_reported'
  | 'is_fully_paid'
>): OrderNextAction | null {
  const code = order.status.code;
  if (code === 'pending') {
    return {
      titleKey: 'orders.nextAction.waitClientTitle',
      hintKey: 'orders.hintWaitingClient',
      tone: 'wait',
    };
  }
  if (code === 'approved_by_client') {
    return {
      titleKey: 'orders.nextAction.startTitle',
      hintKey: 'orders.hintStartTrip',
      tone: 'action',
      ctaKey: 'orders.start',
    };
  }
  if (code === 'in_progress') {
    const pickup = firstPickup(order.route_stops);
    if (pickup?.status === 'arrived') {
      return {
        titleKey: 'orders.nextAction.loadCargoTitle',
        hintKey: 'orders.poexali',
        tone: 'action',
      };
    }
    return {
      titleKey: 'orders.nextAction.arrivePickupTitle',
      hintKey: 'orders.hintGoToPickup',
      tone: 'action',
    };
  }
  if (code === 'in_transit') {
    if (!order.proof_of_delivery) {
      return {
        titleKey: 'orders.nextAction.submitPodTitle',
        hintKey: 'orders.hintGoToDestination',
        tone: 'action',
      };
    }
    if (order.client_delivery_confirmed !== true) {
      return {
        titleKey: 'orders.nextAction.waitDeliveryTitle',
        hintKey: 'orders.waitingForClientDeliveryHint',
        tone: 'wait',
      };
    }
    if (order.client_payment_confirmed !== true && !order.is_fully_paid) {
      if (order.client_paid_reported === true) {
        return {
          titleKey: 'orders.nextAction.confirmPaymentTitle',
          hintKey: 'orders.clientReportedPaid',
          tone: 'action',
          ctaKey: 'orders.markPaymentReceived',
        };
      }
      return {
        titleKey: 'orders.nextAction.waitPaymentTitle',
        hintKey: 'orders.waitingForClientPaymentHint',
        tone: 'wait',
      };
    }
    return {
      titleKey: 'orders.nextAction.completeTitle',
      hintKey: 'orders.hintDeliverAndFinish',
      tone: 'action',
      ctaKey: 'orders.complete',
    };
  }
  return null;
}

export function getClientNextAction(order: Pick<
  Order,
  | 'status'
  | 'proof_of_delivery'
  | 'client_delivery_confirmed'
  | 'client_payment_confirmed'
  | 'client_paid_reported'
  | 'is_fully_paid'
  | 'remaining_amount'
>): OrderNextAction | null {
  const code = order.status.code;
  if (code === 'pending') {
    return {
      titleKey: 'orders.nextAction.approveTitle',
      hintKey: 'orders.journeyHint.pending',
      tone: 'action',
      ctaKey: 'orders.approveOrder',
    };
  }
  if (code === 'approved_by_client' || code === 'in_progress') {
    return {
      titleKey: 'orders.nextAction.waitDriverTitle',
      hintKey: `orders.journeyHint.${code}`,
      tone: 'wait',
    };
  }
  if (code === 'in_transit') {
    if (order.proof_of_delivery && order.client_delivery_confirmed !== true) {
      return {
        titleKey: 'orders.nextAction.confirmDeliveryTitle',
        hintKey: 'orders.clientDeliveryConfirmHint',
        tone: 'action',
        ctaKey: 'orders.clientDeliveryConfirmButton',
      };
    }
    if (order.client_delivery_confirmed === true && order.client_payment_confirmed !== true && !order.is_fully_paid) {
      if (order.client_paid_reported === true) {
        return {
          titleKey: 'orders.nextAction.waitPaymentTitle',
          hintKey: 'orders.clientPaymentStatusReported',
          tone: 'wait',
        };
      }
      const canPayOnline = (order.remaining_amount ?? 0) > 0;
      return {
        titleKey: 'orders.nextAction.payTitle',
        hintKey: 'orders.nextAction.payHint',
        tone: 'action',
        ctaKey: canPayOnline ? 'payments.payRemaining' : 'orders.clientPaymentReportPaid',
        secondaryCtaKey: canPayOnline ? 'orders.clientPaymentReportPaid' : undefined,
      };
    }
    return {
      titleKey: 'orders.nextAction.waitDriverTitle',
      hintKey: 'orders.journeyHint.in_transit',
      tone: 'wait',
    };
  }
  return null;
}

export function getDriverListHintKey(statusCode: string, order?: Order): string {
  if (order) {
    return getDriverNextAction(order)?.hintKey || '';
  }
  switch (statusCode) {
    case 'pending':
      return 'orders.hintWaitingClient';
    case 'approved_by_client':
      return 'orders.hintStartTrip';
    case 'in_progress':
      return 'orders.hintGoToPickup';
    case 'in_transit':
      return 'orders.hintGoToDestination';
    default:
      return '';
  }
}

export function getClientListHintKey(order: Order): string {
  return getClientNextAction(order)?.hintKey || '';
}

export function shouldShowPickupNavigation(statusCode: string): boolean {
  return statusCode === 'approved_by_client' || statusCode === 'in_progress';
}

export function shouldShowDestinationNavigation(statusCode: string): boolean {
  return statusCode === 'in_transit';
}

export function formatDisplayAddress(address?: string | null): string {
  if (!address) {return '';}
  const trimmed = address.trim();
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}
