import AsyncStorage from '@react-native-async-storage/async-storage';
import { bidsService } from './bidsService';
import { ordersService } from './ordersService';
import { toastService } from './toastService';

const QUEUE_KEY = '@logistika_offline_action_queue';

export type OfflineActionType = 'create_bid' | 'confirm_client_payment';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: string;
}

async function readQueue(): Promise<OfflineAction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as OfflineAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(actions: OfflineAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
}

export async function enqueueOfflineAction(
  type: OfflineActionType,
  payload: Record<string, unknown>,
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

async function executeAction(action: OfflineAction): Promise<void> {
  switch (action.type) {
    case 'create_bid':
      await bidsService.createBid(action.payload as Parameters<typeof bidsService.createBid>[0]);
      return;
    case 'confirm_client_payment':
      await ordersService.confirmClientPayment(
        Number(action.payload.orderId),
        Boolean(action.payload.paid),
      );
      return;
    default:
      return;
  }
}

export async function flushOfflineActionQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return 0;
  }

  const remaining: OfflineAction[] = [];
  let processed = 0;

  for (const action of queue) {
    try {
      await executeAction(action);
      processed += 1;
    } catch {
      remaining.push(action);
    }
  }

  await writeQueue(remaining);
  if (processed > 0) {
    toastService.success(`Offline: ${processed} ta amal bajarildi`);
  }
  return processed;
}

export async function getOfflineQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export function isOfflineError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  const code = (error as any)?.code;
  return (
    code === 'NETWORK_ERROR' ||
    message.includes('network') ||
    message.includes('offline') ||
    !(error as any)?.response
  );
}
