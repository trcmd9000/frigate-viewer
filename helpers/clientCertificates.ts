import {NativeModules, Platform} from 'react-native';
import {CertificateInfo as FullCertificateInfo} from '../store/settings';
import {handleError} from './errorHandler';

/**
 * Information about an available client certificate for listing.
 */
export interface CertificateListItem {
  alias?: string;
  identity?: string;
  commonName?: string;
  type?: string;
}

/**
 * Result of checking certificate availability.
 */
export interface CertificateAvailability {
  exists: boolean;
  isPrivateKeyEntry?: boolean;
  identity?: string;
  alias?: string;
}

interface NativeCertificateModule {
  selectCertificate?: (currentAlias: string) => Promise<string>;
  listCertificates?: () => Promise<CertificateListItem[]>;
  getCertificateChain?: (
    alias: string,
  ) => Promise<Array<{type?: string}> | undefined>;
  getCertificateInfo?: (
    alias: string,
  ) => Promise<CertificateListItem | undefined>;
  getCertificateDetails?: (
    alias: string,
  ) => Promise<FullCertificateInfo | undefined>;
  checkCertificateAvailability?: (
    alias: string,
  ) => Promise<CertificateAvailability>;
  getPrivateKeyInfo?: (
    alias: string,
  ) => Promise<{isPrivateKeyAvailable: boolean}>;
}

/**
 * Client certificate utility module.
 * Provides a cross-platform abstraction for accessing device certificates
 * stored in Android Keystore or iOS Keychain.
 */
class ClientCertificateManager {
  private platformModule: NativeCertificateModule | undefined;

  constructor() {
    this.platformModule = NativeModules.ClientCertModule as
      | NativeCertificateModule
      | undefined;

    if (!this.platformModule) {
      console.warn(
        `ClientCertModule not available on ${Platform.OS}. ` +
          'Client certificate authentication will not be available.',
      );
    }
  }

  async listCertificates(): Promise<CertificateListItem[]> {
    if (!this.platformModule?.listCertificates) {
      return Promise.resolve([]);
    }

    try {
      const result = await this.platformModule.listCertificates();
      return result || [];
    } catch (error) {
      await handleError(error, 'clientCertificates.listCertificates');
      return [];
    }
  }

  /**
   * Get detailed certificate information including Subject DN, Issuer DN, dates, etc.
   * This calls the native getCertificateDetails() method.
   */
  async getCertificateDetails(
    alias: string,
  ): Promise<FullCertificateInfo | undefined> {
    if (!this.platformModule?.getCertificateDetails) {
      return undefined;
    }

    try {
      const details = await this.platformModule.getCertificateDetails(alias);
      return details;
    } catch (error) {
      await handleError(
        error,
        `clientCertificates.getCertificateDetails(${alias})`,
      );
      return undefined;
    }
  }

  /**
   * Calculate days until certificate expiry.
   * Returns negative number if already expired.
   */
  getDaysUntilExpiry(notAfter: Date): number {
    const today = new Date();
    const expiryDate = new Date(notAfter);
    const todayUtc = Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const expiryUtc = Date.UTC(
      expiryDate.getFullYear(),
      expiryDate.getMonth(),
      expiryDate.getDate(),
    );
    return Math.round((expiryUtc - todayUtc) / (1000 * 3600 * 24));
  }

  /**
   * Get expiry status and warning message.
   */
  getExpiryStatus(notAfter: Date): {
    isExpired: boolean;
    daysUntilExpiry: number;
    warningMessage?: string;
  } {
    const daysUntilExpiry = this.getDaysUntilExpiry(notAfter);
    const isExpired = daysUntilExpiry < 0;

    let warningMessage: string | undefined;
    if (isExpired) {
      warningMessage = '🔴 EXPIRED';
    } else if (daysUntilExpiry < 30) {
      warningMessage = `⚠️ EXPIRES IN ${daysUntilExpiry} DAYS`;
    }

    return {
      isExpired,
      daysUntilExpiry,
      warningMessage,
    };
  }

  async getCertificateInfo(
    alias: string,
  ): Promise<CertificateListItem | undefined> {
    if (!this.platformModule) {
      return undefined;
    }

    try {
      if (Platform.OS === 'android') {
        if (this.platformModule.getCertificateChain) {
          const chain = await this.platformModule.getCertificateChain(alias);
          return {
            alias,
            type:
              Array.isArray(chain) && chain.length > 0
                ? chain[0].type
                : undefined,
          };
        }
      } else if (this.platformModule.getCertificateInfo) {
        return await this.platformModule.getCertificateInfo(alias);
      }
    } catch (error) {
      console.error(`Error getting certificate info for ${alias}:`, error);
    }

    return undefined;
  }

  async checkCertificateAvailability(
    alias: string,
  ): Promise<CertificateAvailability> {
    if (!this.platformModule?.checkCertificateAvailability) {
      return {exists: false};
    }

    try {
      const result = await this.platformModule.checkCertificateAvailability(
        alias,
      );
      if (Platform.OS === 'android') {
        return {
          exists: result.exists,
          isPrivateKeyEntry: result.isPrivateKeyEntry,
          alias,
        };
      }

      return {
        exists: result.exists,
        identity: result.identity,
      };
    } catch (error) {
      console.error(
        `Error checking certificate availability for ${alias}:`,
        error,
      );
    }

    return {exists: false};
  }

  async getPrivateKeyInfo(
    alias: string,
  ): Promise<{isPrivateKeyAvailable: boolean}> {
    if (Platform.OS !== 'android' || !this.platformModule?.getPrivateKeyInfo) {
      return {isPrivateKeyAvailable: false};
    }

    try {
      return await this.platformModule.getPrivateKeyInfo(alias);
    } catch (error) {
      console.error(`Error getting private key info for ${alias}:`, error);
      return {isPrivateKeyAvailable: false};
    }
  }

  async selectCertificate(currentAlias = ''): Promise<string | undefined> {
    if (!this.platformModule?.selectCertificate) {
      return undefined;
    }

    try {
      return await this.platformModule.selectCertificate(currentAlias);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'CERT_SELECTION_CANCELLED'
      ) {
        return undefined;
      }
      await handleError(error, 'clientCertificates.selectCertificate');
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.platformModule;
  }
}

export const clientCertManager = new ClientCertificateManager();
export default ClientCertificateManager;

// Re-export CertificateInfo from settings for convenience
export type {CertificateInfo} from '../store/settings';
