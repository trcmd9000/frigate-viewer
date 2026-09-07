import {NativeModules, Platform} from 'react-native';
import {handleError} from './errorHandler';

/**
 * Result of checking certificate availability.
 */
export interface CertificateAvailability {
  exists: boolean;
  isPrivateKeyEntry?: boolean;
  alias?: string;
}

interface NativeCertificateModule {
  selectCertificate?: (currentAlias: string) => Promise<string>;
  checkCertificateAvailability?: (
    alias: string,
  ) => Promise<CertificateAvailability>;
}

/**
 * Client certificate utility module.
 *
 * Android does not permit applications to enumerate protected identities.
 * Selection is therefore delegated to Android's system KeyChain chooser and
 * only the selected alias is retained by the app.
 */
class ClientCertificateManager {
  private platformModule: NativeCertificateModule | undefined;

  constructor() {
    this.platformModule = NativeModules.ClientCertModule as
      | NativeCertificateModule
      | undefined;
  }

  async checkCertificateAvailability(
    alias: string,
  ): Promise<CertificateAvailability> {
    if (
      typeof alias !== 'string' ||
      !alias.trim() ||
      !this.platformModule?.checkCertificateAvailability
    ) {
      return {exists: false, alias};
    }

    try {
      const result = await this.platformModule.checkCertificateAvailability(
        alias,
      );
      return {
        exists: Boolean(result.exists),
        isPrivateKeyEntry: result.isPrivateKeyEntry,
        alias,
      };
    } catch (error) {
      await handleError(error, 'clientCertificates.checkAvailability');
    }

    return {exists: false, alias};
  }

  async selectCertificate(currentAlias = ''): Promise<string | undefined> {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    if (!this.platformModule?.selectCertificate) {
      throw new Error('Android client-certificate chooser is unavailable');
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
    return Platform.OS === 'android' && !!this.platformModule;
  }
}

export const clientCertManager = new ClientCertificateManager();
export default ClientCertificateManager;
