import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

const TOKEN_SERVICE = 'logistika.auth.tokens';

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
};

class SecureTokenStorage {
  private cache: StoredTokens | null = null;

  private async readTokens(): Promise<StoredTokens | null> {
    if (this.cache) {
      return this.cache;
    }

    const credentials = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
    if (credentials) {
      try {
        const parsed = JSON.parse(credentials.password) as Partial<StoredTokens>;
        if (!parsed.accessToken || !parsed.refreshToken) {
          await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
        } else {
          this.cache = {
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
          };
          return this.cache;
        }
      } catch {
        await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
      }
    }

    const legacyAccessToken = await AsyncStorage.getItem('access_token');
    const legacyRefreshToken = await AsyncStorage.getItem('refresh_token');
    if (!legacyAccessToken || !legacyRefreshToken) {
      return null;
    }

    await this.setTokens(legacyAccessToken, legacyRefreshToken);
    await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
    return this.cache;
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.readTokens();
    return tokens?.accessToken ?? null;
  }

  async getRefreshToken(): Promise<string | null> {
    const tokens = await this.readTokens();
    return tokens?.refreshToken ?? null;
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    const nextTokens = { accessToken, refreshToken };
    await Keychain.setGenericPassword('auth', JSON.stringify(nextTokens), {
      service: TOKEN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    this.cache = nextTokens;
  }

  async updateAccessToken(accessToken: string): Promise<void> {
    const current = await this.readTokens();
    if (!current?.refreshToken) {
      throw new Error('No refresh token available');
    }
    await this.setTokens(accessToken, current.refreshToken);
  }

  async updateTokens(tokens: { accessToken: string; refreshToken?: string | null }): Promise<void> {
    const current = await this.readTokens();
    const refreshToken = tokens.refreshToken ?? current?.refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    await this.setTokens(tokens.accessToken, refreshToken);
  }

  async clear(): Promise<void> {
    this.cache = null;
    await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
    await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
  }

  async hasTokens(): Promise<boolean> {
    return Boolean(await this.getAccessToken());
  }
}

export const secureTokenStorage = new SecureTokenStorage();
