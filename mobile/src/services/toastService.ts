type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
  type: ToastType;
  message: string;
}

type Listener = (payload: ToastPayload) => void;

class ToastService {
  private listeners = new Set<Listener>();

  onToast(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  show(payload: ToastPayload): void {
    this.listeners.forEach((listener) => listener(payload));
  }

  success(message: string): void {
    this.show({ type: 'success', message });
  }

  error(message: string): void {
    this.show({ type: 'error', message });
  }

  info(message: string): void {
    this.show({ type: 'info', message });
  }
}

export const toastService = new ToastService();
