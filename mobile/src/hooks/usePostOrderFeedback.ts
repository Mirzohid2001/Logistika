import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Order, User } from '../types';
import { ratingsService } from '../services/ratingsService';
import { useAuth } from '../context/AuthContext';
import { navigateRoot } from '../utils/navigationHelpers';

const dismissedKey = (orderId: number) => `post_order_feedback_dismissed_${orderId}`;

export function usePostOrderFeedback(order: Order | null) {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const checkedRef = useRef<number | null>(null);

  const getCounterparty = useCallback((): User | null => {
    if (!order || !user) {return null;}
    const driver = typeof order.driver === 'object' ? order.driver : null;
    const client = typeof order.client === 'object' ? order.client : null;
    if (user.is_client && driver) {return driver;}
    if (user.is_driver && client) {return client;}
    return null;
  }, [order, user]);

  const dismiss = useCallback(async () => {
    if (order) {
      await AsyncStorage.setItem(dismissedKey(order.id), '1');
    }
    setVisible(false);
  }, [order]);

  const openRate = useCallback(() => {
    if (!order) {return;}
    setVisible(false);
    navigateRoot(navigation, 'Rating', { orderId: order.id });
  }, [navigation, order]);

  const openComplaint = useCallback(() => {
    if (!order) {return;}
    setVisible(false);
    navigateRoot(navigation, 'Complaint', { orderId: order.id });
  }, [navigation, order]);

  useEffect(() => {
    const evaluate = async () => {
      if (!order || !user || order.status.code !== 'completed') {
        setVisible(false);
        return;
      }
      if (checkedRef.current === order.id) {return;}
      checkedRef.current = order.id;

      const dismissed = await AsyncStorage.getItem(dismissedKey(order.id));
      if (dismissed) {return;}

      try {
        const ratings = await ratingsService.getRatings({ order_id: order.id });
        const alreadyRated = ratings.some((r) => r.from_user?.id === user.id);
        if (!alreadyRated) {
          setVisible(true);
        }
      } catch {
        // ignore — user can still rate manually
      }
    };

    evaluate();
  }, [order, user]);

  return {
    feedbackVisible: visible,
    counterparty: getCounterparty(),
    dismissFeedback: dismiss,
    openRate,
    openComplaint,
  };
}
