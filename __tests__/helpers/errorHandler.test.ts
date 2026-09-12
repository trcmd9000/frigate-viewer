import {
  AppError,
  createError,
  ErrorCode,
  normalizeError,
  getUserFriendlyMessage,
  getErrorSeverityStyle,
} from '../../helpers/errorHandler';

describe('errorHandler', () => {
  describe('createError', () => {
    it('should create an error with default severity', () => {
      const error = createError(ErrorCode.NETWORK_ERROR, 'Network failed');
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.message).toBe('Network failed');
      expect(error.severity).toBe('error');
    });

    it('should create an error with custom severity', () => {
      const error = createError(
        ErrorCode.UNKNOWN,
        'Something happened',
        'warning',
      );
      expect(error.severity).toBe('warning');
    });

    it('should create an error with context', () => {
      const context = {userId: 123, action: 'login'};
      const error = createError(
        ErrorCode.AUTH_FAILED,
        'Auth failed',
        'error',
        context,
      );
      expect(error.context).toEqual(context);
    });
  });

  describe('normalizeError', () => {
    it('should return AppError as-is', () => {
      const appError: AppError = {
        code: ErrorCode.NETWORK_ERROR,
        message: 'Network error',
        severity: 'error',
      };
      const result = normalizeError(appError);
      expect(result).toBe(appError);
    });

    it('should normalize network error', () => {
      const error = new Error('NetworkError: Failed to fetch');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(result.severity).toBe('error');
      expect(result.message).toContain('Network connection failed');
    });

    it('should normalize timeout error', () => {
      const error = new Error('Request timeout');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.TIMEOUT);
      expect(result.message).toContain('timed out');
    });

    it('should normalize a native HTTP timeout without treating it as a certificate error', () => {
      const error = new Error('Connection timed out') as Error & {
        code: string;
      };
      error.code = 'HTTP_TIMEOUT';
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.TIMEOUT);
      expect(result.message).toContain('address, port');
    });

    it('should normalize a native TLS handshake error', () => {
      const error = new Error('TLS handshake failed') as Error & {
        code: string;
      };
      error.code = 'TLS_HANDSHAKE_ERROR';
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.TLS_HANDSHAKE);
      expect(result.message).toContain('TLS handshake failed');
    });

    it('should preserve a response format error', () => {
      const error = new Error(
        'Server returned HTTP 200 with text/html instead of JSON.',
      );
      error.name = ErrorCode.RESPONSE_FORMAT;
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.RESPONSE_FORMAT);
      expect(result.message).toContain('text/html');
    });

    it('should normalize certificate expired error', () => {
      const error = new Error('Certificate expired');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.CERT_EXPIRED);
      expect(result.message).toContain('expired');
    });

    it('should normalize certificate not found error', () => {
      const error = new Error('Certificate not found');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.CERT_NOT_FOUND);
      expect(result.message).toContain('not found');
    });

    it('should normalize the native missing identity code', () => {
      const error = new Error('The selected client certificate is unavailable') as
        Error & {code: string};
      error.code = 'CERT_IDENTITY_UNAVAILABLE';

      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.CERT_NOT_FOUND);
    });

    it('should normalize secure storage unavailability', () => {
      const error = new Error(
        'Platform secure credential storage is unavailable',
      ) as Error & {code: string};
      error.code = 'SECURE_STORAGE_UNAVAILABLE';

      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.SECURE_STORAGE);
    });

    it('should normalize certificate invalid error', () => {
      const error = new Error('Invalid certificate');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.CERT_INVALID);
      expect(result.message).toContain('invalid');
    });

    it('should normalize unauthorized error', () => {
      const error = new Error('Unauthorized 401');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(result.message).toContain('failed');
    });

    it('should normalize auth failed error', () => {
      const error = new Error('Authentication failed');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.AUTH_FAILED);
      expect(result.message).toContain('Authentication failed');
    });

    it('should normalize config error', () => {
      const error = new Error('Invalid config');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.INVALID_CONFIG);
      expect(result.message).toContain('configuration');
    });

    it('should normalize server error', () => {
      const error = new Error('Server error 500');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.SERVER_ERROR);
      expect(result.message).toContain('Server error');
    });

    it('should normalize client error', () => {
      const error = new Error('Bad request 400');
      const result = normalizeError(error);
      expect(result.code).toBe(ErrorCode.CLIENT_ERROR);
      expect(result.message).toContain('Invalid request');
    });

    it('should normalize string error', () => {
      const result = normalizeError('Something went wrong');
      expect(result.code).toBe(ErrorCode.UNKNOWN);
      expect(result.message).toBe('Something went wrong');
    });

    it('should normalize object with message property', () => {
      const result = normalizeError({message: 'Object error'});
      expect(result.code).toBe(ErrorCode.UNKNOWN);
      expect(result.message).toBe('Object error');
    });

    it('should normalize unknown error type', () => {
      const result = normalizeError({random: 'data'});
      expect(result.code).toBe(ErrorCode.UNKNOWN);
      expect(result.message).toBe('An unknown error occurred');
    });

    it('should handle null/undefined errors', () => {
      const resultNull = normalizeError(null);
      const resultUndefined = normalizeError(undefined);

      expect(resultNull.code).toBe(ErrorCode.UNKNOWN);
      expect(resultUndefined.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return user-friendly message from AppError', () => {
      const error = createError(ErrorCode.NETWORK_ERROR, 'Connection failed');
      const message = getUserFriendlyMessage(error);
      expect(message).toBe('Connection failed');
    });

    it('should redact URLs and credentials from displayed errors', () => {
      const error = createError(
        ErrorCode.UNKNOWN,
        'Request https://private.example/api failed with password=secret',
      );

      expect(getUserFriendlyMessage(error)).toBe(
        'Request [URL] failed with password=******',
      );
    });
  });

  describe('getErrorSeverityStyle', () => {
    it('should return error style', () => {
      const style = getErrorSeverityStyle('error');
      expect(style.color).toBe('#ff4444');
      expect(style.level).toBe('error');
    });

    it('should return warning style', () => {
      const style = getErrorSeverityStyle('warning');
      expect(style.color).toBe('#ffaa00');
      expect(style.level).toBe('warning');
    });

    it('should return info style', () => {
      const style = getErrorSeverityStyle('info');
      expect(style.color).toBe('#0088ff');
      expect(style.level).toBe('info');
    });
  });
});
