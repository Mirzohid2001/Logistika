import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// v2 starts the Premium Navigation redesign in dark mode while keeping the toggle available.
const THEME_STORAGE_KEY = 'app-theme-preference-v2';

export type ThemePreference = 'system' | 'light' | 'dark';

const PREFERENCE_ORDER: ThemePreference[] = ['system', 'light', 'dark'];

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'dark',
  setPreference: () => undefined,
  cyclePreference: () => undefined,
  isReady: true,
});

export function resolveIsDark(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): boolean {
  if (preference === 'dark') {
    return true;
  }
  if (preference === 'light') {
    return false;
  }
  return systemScheme === 'dark';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (
          mounted &&
          (stored === 'system' || stored === 'light' || stored === 'dark')
        ) {
          setPreferenceState(stored);
        }
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((current) => {
      const index = PREFERENCE_ORDER.indexOf(current);
      const next = PREFERENCE_ORDER[(index + 1) % PREFERENCE_ORDER.length];
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference, cyclePreference, isReady }),
    [preference, setPreference, cyclePreference, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useThemePreference(): ThemeContextValue {
  return useContext(ThemeContext);
}
