import { createContext } from 'react';
import type { User } from '../types';
import type { MarketplaceRole } from '../utils/marketplaceRole';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsSubscription: boolean;
  hasActiveSubscription: boolean;
  activeMarketplaceRole: 'client' | 'driver' | null;
  canSwitchMarketplaceRole: boolean;
  setActiveMarketplaceRole: (role: MarketplaceRole) => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshUser: (options?: { force?: boolean }) => Promise<void>;
}

export interface RegisterData {
  phone: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
  is_driver: boolean;
  sms_code?: string;
  company_inn?: string;
}

/** Alohida modul — Fast Refresh AuthProvider'ni yangilaganda context identity saqlanadi. */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
