import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type IosLocationAuthStatus =
  | 'always'
  | 'whenInUse'
  | 'denied'
  | 'disabled'
  | 'restricted'
  | 'undetermined';

type IosLocationAuthNative = {
  getStatus: () => Promise<IosLocationAuthStatus>;
  requestAlways: () => Promise<IosLocationAuthStatus>;
};

function getNative(): IosLocationAuthNative | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  return (NativeModules.IosLocationAuth as IosLocationAuthNative | undefined) ?? null;
}

export async function getIosLocationAuthStatus(): Promise<IosLocationAuthStatus> {
  const native = getNative();
  if (!native) {
    return 'undetermined';
  }
  return native.getStatus();
}

export async function requestIosAlwaysAuthorization(): Promise<IosLocationAuthStatus> {
  const native = getNative();
  if (!native) {
    return 'undetermined';
  }
  return native.requestAlways();
}

export function isIosAlwaysGranted(status: IosLocationAuthStatus): boolean {
  return status === 'always';
}

export function subscribeIosLocationAuth(
  listener: (status: IosLocationAuthStatus) => void,
): () => void {
  const native = NativeModules.IosLocationAuth;
  if (Platform.OS !== 'ios' || !native) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(native);
  const sub = emitter.addListener('iosLocationAuthChanged', (status: IosLocationAuthStatus) => {
    listener(status);
  });
  return () => sub.remove();
}
