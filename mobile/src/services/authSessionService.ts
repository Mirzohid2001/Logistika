type SessionExpiredPayload = {
  reason?: string;
};

type SessionExpiredListener = (payload: SessionExpiredPayload) => void;
type SubscriptionRequiredListener = () => void;

class AuthSessionService {
  private listeners = new Set<SessionExpiredListener>();
  private subscriptionListeners = new Set<SubscriptionRequiredListener>();

  onSessionExpired(listener: SessionExpiredListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitSessionExpired(payload: SessionExpiredPayload = {}): void {
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error('Auth session listener error:', error);
      }
    });
  }

  onSubscriptionRequired(listener: SubscriptionRequiredListener): () => void {
    this.subscriptionListeners.add(listener);
    return () => this.subscriptionListeners.delete(listener);
  }

  emitSubscriptionRequired(): void {
    this.subscriptionListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Subscription listener error:', error);
      }
    });
  }
}

export const authSessionService = new AuthSessionService();
