import {NativeModules, Platform} from 'react-native';
import {clientCertManager} from './clientCertificates';

export interface HttpRequestOptions extends RequestInit {
  clientCertAlias?: string;
  allowSelfSignedServer?: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

interface NativeClientCertResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

interface NativeClientCertModule {
  performHttpRequestWithClientCert?: (
    url: string,
    certIdentifier: string,
    method: string,
    headers: Array<{key: string; value: string}>,
    body: string | undefined,
    allowSelfSignedServer: boolean,
  ) => Promise<NativeClientCertResponse>;
}

class HttpClientWithClientCert {
  private clientCertModule: NativeClientCertModule | undefined;

  constructor() {
    this.clientCertModule = NativeModules.ClientCertModule as
      | NativeClientCertModule
      | undefined;
  }

  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    const {
      clientCertAlias,
      allowSelfSignedServer = false,
      ...fetchOptions
    } = options;

    if (!clientCertAlias || !this.clientCertModule) {
      return this.performFetch(url, fetchOptions as RequestInit);
    }

    const availability = await clientCertManager.checkCertificateAvailability(
      clientCertAlias,
    );
    if (!availability.exists) {
      throw new Error('The selected client certificate is unavailable');
    }

    if (Platform.OS === 'android') {
      return this.requestWithAndroidClientCert(
        url,
        clientCertAlias,
        allowSelfSignedServer,
        fetchOptions as RequestInit,
      );
    }
    if (Platform.OS === 'ios') {
      return this.requestWithIOSClientCert(
        url,
        clientCertAlias,
        allowSelfSignedServer,
        fetchOptions as RequestInit,
      );
    }

    throw new Error(`Client certificates are not supported on ${Platform.OS}`);
  }

  private async performFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<HttpResponse> {
    const response = await fetch(url, options);
    const body = await response.text();

    return {
      status: response.status,
      headers: this.headersToObject(response.headers),
      body,
      json: async () => JSON.parse(body) as unknown,
      text: async () => body,
    };
  }

  private async requestWithAndroidClientCert(
    url: string,
    certAlias: string,
    allowSelfSignedServer: boolean,
    options: RequestInit,
  ): Promise<HttpResponse> {
    if (!this.clientCertModule?.performHttpRequestWithClientCert) {
      console.warn(
        'Native HTTP request with client cert not available on Android. ' +
          'Using standard fetch.',
      );
      return this.performFetch(url, options);
    }

    try {
      const result =
        await this.clientCertModule.performHttpRequestWithClientCert(
          url,
          certAlias,
          options.method || 'GET',
          this.objectToHeaders(
            (options.headers as Record<string, string>) || {},
          ),
          options.body as string | undefined,
          allowSelfSignedServer,
        );

      return {
        status: result.statusCode,
        headers: result.headers || {},
        body: result.body || '',
        json: async () => JSON.parse(result.body || '{}') as unknown,
        text: async () => result.body || '',
      };
    } catch (error) {
      console.error('Android native client cert request failed:', error);
      throw error;
    }
  }

  private async requestWithIOSClientCert(
    url: string,
    certIdentity: string,
    allowSelfSignedServer: boolean,
    options: RequestInit,
  ): Promise<HttpResponse> {
    if (!this.clientCertModule?.performHttpRequestWithClientCert) {
      console.warn(
        'Native HTTP request with client cert not available on iOS. ' +
          'Using standard fetch.',
      );
      return this.performFetch(url, options);
    }

    try {
      const result =
        await this.clientCertModule.performHttpRequestWithClientCert(
          url,
          certIdentity,
          options.method || 'GET',
          this.objectToHeaders(
            (options.headers as Record<string, string>) || {},
          ),
          options.body as string | undefined,
          allowSelfSignedServer,
        );

      return {
        status: result.statusCode,
        headers: result.headers || {},
        body: result.body || '',
        json: async () => JSON.parse(result.body || '{}') as unknown,
        text: async () => result.body || '',
      };
    } catch (error) {
      console.error('iOS native client cert request failed:', error);
      throw error;
    }
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }

  private objectToHeaders(
    headers: Record<string, string>,
  ): Array<{key: string; value: string}> {
    return Object.entries(headers).map(([key, value]) => ({key, value}));
  }
}

export const httpClientWithCert = new HttpClientWithClientCert();
export default HttpClientWithClientCert;
