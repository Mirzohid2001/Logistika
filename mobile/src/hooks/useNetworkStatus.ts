import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);

  useEffect(() => {
    const applyState = (state: NetInfoState) => {
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(state.isInternetReachable);
    };

    const unsubscribe = NetInfo.addEventListener(applyState);
    void NetInfo.fetch().then(applyState);
    return unsubscribe;
  }, []);

  const isOffline =
    isConnected === false || isInternetReachable === false;

  return { isConnected, isInternetReachable, isOffline };
}
