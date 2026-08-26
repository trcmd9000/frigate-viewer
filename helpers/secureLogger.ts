/**
 * SecureLogger - A logging utility that removes sensitive data
 * - No URLs, IPs, Ports, or Auth Tokens
 * - No Server Credentials or Certificate Names
 * - Only logs sanitized information safe for error tracking
 */
class SecureLoggerService {
  /**
   * Logs an HTTP request without exposing full URLs
   * @param method - HTTP method (GET, POST, DELETE, etc.)
   * @param endpoint - Generic endpoint like '/api/stats', '/login', etc.
   */
  logRequest(method: string, endpoint: string): void {
    const sanitizedEndpoint = this.sanitizeEndpoint(endpoint);
    const message = `${method} ${sanitizedEndpoint}`;

    if (__DEV__) {
      console.log(`[SecureLogger] ${message}`);
    }
  }

  /**
   * Logs an error with context, filtering sensitive data from stack traces
   * @param error - The error object
   * @param context - Optional context string (action, module name, etc.)
   */
  logError(error: Error, context?: string): void {
    const sanitizedError = this.sanitizeError(error);
    const sanitizedContext = context
      ? this.sanitizeContext(context)
      : undefined;
    const message = sanitizedContext
      ? `[SecureLogger] Error in ${sanitizedContext}: ${sanitizedError.message}`
      : `[SecureLogger] ${sanitizedError.message}`;

    console.error(message);
  }

  /**
   * Logs authentication actions without exposing credentials
   * @param action - Auth action like 'login', 'logout', 'token-refresh'
   */
  logAuth(action: string): void {
    const sanitizedAction = this.sanitizeAction(action);
    const message = `Auth: ${sanitizedAction}`;

    if (__DEV__) {
      console.log(`[SecureLogger] ${message}`);
    }
  }

  /**
   * Sanitizes a URL by removing sensitive parts
   * @param url - The URL to sanitize
   * @returns Sanitized URL or generic protocol indicator
   */
  safeUrl(url: string): string {
    if (!url) {
      return '[URL]';
    }

    try {
      const urlObj = new URL(url);

      // Remove auth, port, and query params
      // Only keep protocol and basic path structure
      const pathname = urlObj.pathname || '/';
      const protocol = urlObj.protocol.replace(':', '');

      return `${protocol}://[SERVER]${pathname}`;
    } catch {
      // If URL parsing fails, return generic indicator
      return '[URL]';
    }
  }

  /**
   * Internal: Sanitize endpoint - keep generic parts, remove specific IPs/hosts
   */
  private sanitizeEndpoint(endpoint: string): string {
    if (!endpoint) {
      return '/api';
    }

    // Keep the generic API path structure
    // e.g., '/api/stats', '/login', '/cameras', '/events'
    // Remove any IPs, hostnames, ports, or query parameters
    const pathPart = endpoint.split('?')[0];

    // Filter out IP addresses and hostnames
    const sanitized = pathPart
      .split('/')
      .filter(segment => {
        // Keep standard API segments
        if (
          /^(api|stats|events|cameras|login|config|clips|recordings|zones|objects)$/i.test(
            segment,
          )
        ) {
          return true;
        }
        // Filter out IPs, domains, ports, tokens, etc.
        if (/^\d+$/.test(segment) || /[a-z0-9-]*\.[a-z0-9-]*/.test(segment)) {
          return false;
        }
        // Keep short segments (likely IDs or named parameters)
        if (segment.length > 0 && segment.length <= 36) {
          return true;
        }
        return false;
      })
      .join('/');

    return sanitized || '/api';
  }

  /**
   * Internal: Sanitize error message and stack
   */
  private sanitizeError(error: Error): Error {
    const sanitized = new Error();
    sanitized.name = error.name;

    // Keep the error message but remove URLs/IPs
    sanitized.message = this.removeUrlsAndIps(error.message);

    // Keep stack trace but remove URLs/IPs/auth tokens
    if (error.stack) {
      sanitized.stack = this.removeUrlsAndIps(error.stack);
    }

    return sanitized;
  }

  /**
   * Internal: Sanitize context string
   */
  private sanitizeContext(context: string): string {
    if (!context) {
      return 'unknown';
    }

    // Keep module/function names, remove URLs and sensitive data
    return (
      this.removeUrlsAndIps(context).split('/').pop()?.slice(0, 50) ||
      'operation'
    );
  }

  /**
   * Internal: Sanitize action name
   */
  private sanitizeAction(action: string): string {
    if (!action) {
      return 'unknown';
    }

    // Normalize action names like 'login', 'logout', 'token-refresh'
    return action
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 30);
  }

  /**
   * Internal: Remove URLs, IPs, and auth tokens from text
   */
  private removeUrlsAndIps(text: string): string {
    if (!text) {
      return '';
    }

    return (
      text
        // Remove URLs (http://, https://, etc.)
        .replace(/https?:\/\/[^\s"'<>)]+/g, '[URL]')
        // Remove IPv4 addresses
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
        // Remove IPv6 addresses
        .replace(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi, '[IPv6]')
        // Remove common auth patterns (Bearer, Basic, token=)
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer [TOKEN]')
        .replace(/Basic\s+[^\s]+/gi, 'Basic [TOKEN]')
        .replace(/token[=:]\s*[^\s,"'<>)]+/gi, 'token=[TOKEN]')
        // Remove certificate paths/names
        .replace(/(?:cert|certificate|p12|jks|keystore)[^\s]*/gi, '[CERT]')
        // Remove potential password values (simplified)
        .replace(/password[=:]\s*[^\s,"'<>)]+/gi, 'password=[REDACTED]')
    );
  }
}

export const SecureLogger = new SecureLoggerService();
