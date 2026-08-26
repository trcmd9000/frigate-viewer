/**
 * Centralized Error Handling System
 * Provides standardized error types, creation, normalization, and handling
 */
import {SecureLogger} from './secureLogger';

/**
 * Standard error codes used throughout the application
 */
export enum ErrorCode {
  NETWORK_ERROR = 'ERR_NETWORK',
  TIMEOUT = 'ERR_TIMEOUT',
  CERT_NOT_FOUND = 'ERR_CERT_NOT_FOUND',
  CERT_EXPIRED = 'ERR_CERT_EXPIRED',
  CERT_INVALID = 'ERR_CERT_INVALID',
  AUTH_FAILED = 'ERR_AUTH',
  UNAUTHORIZED = 'ERR_UNAUTHORIZED',
  INVALID_CONFIG = 'ERR_CONFIG',
  FORM_VALIDATION = 'ERR_FORM_VALIDATION',
  SERVER_ERROR = 'ERR_SERVER',
  CLIENT_ERROR = 'ERR_CLIENT',
  UNKNOWN = 'ERR_UNKNOWN',
}

/**
 * Application-wide error object structure
 */
export interface AppError {
  code: string;
  message: string;
  context?: Record<string, any>;
  severity: 'error' | 'warning' | 'info';
  originalError?: Error;
}

/**
 * Create a standardized app error
 */
export const createError = (
  code: string,
  message: string,
  severity: 'error' | 'warning' | 'info' = 'error',
  context?: Record<string, any>,
): AppError => ({
  code,
  message,
  severity,
  context,
});

/**
 * Normalize various error types to AppError format
 */
export const normalizeError = (error: unknown): AppError => {
  // If already an AppError, return as-is
  if (isAppError(error)) {
    return error;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    const appError = normalizeStandardError(error);
    return appError;
  }

  // Handle objects with message property
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    return createError(ErrorCode.UNKNOWN, (error as any).message, 'error', {
      original: error,
    });
  }

  // Handle string errors
  if (typeof error === 'string') {
    return createError(ErrorCode.UNKNOWN, error, 'error');
  }

  // Fallback for unknown error types
  return createError(ErrorCode.UNKNOWN, 'An unknown error occurred', 'error', {
    original: error,
  });
};

/**
 * Normalize standard Error objects by analyzing their type and message
 */
const normalizeStandardError = (error: Error): AppError => {
  const message = error.message || 'Unknown error';

  // Network errors
  if (
    error.name === 'NetworkError' ||
    message.toLowerCase().includes('network')
  ) {
    return createError(
      ErrorCode.NETWORK_ERROR,
      'Network connection failed. Please check your connection and try again.',
      'error',
      {originalMessage: message},
    );
  }

  // Timeout errors
  if (
    error.name === 'TimeoutError' ||
    message.toLowerCase().includes('timeout')
  ) {
    return createError(
      ErrorCode.TIMEOUT,
      'Request timed out. Please try again.',
      'error',
      {originalMessage: message},
    );
  }

  // Certificate errors
  if (message.toLowerCase().includes('certificate')) {
    if (message.toLowerCase().includes('expired')) {
      return createError(
        ErrorCode.CERT_EXPIRED,
        'Client certificate has expired. Please update your certificate.',
        'error',
        {originalMessage: message},
      );
    }
    if (message.toLowerCase().includes('not found')) {
      return createError(
        ErrorCode.CERT_NOT_FOUND,
        'Client certificate not found. Please configure your certificate.',
        'error',
        {originalMessage: message},
      );
    }
    return createError(
      ErrorCode.CERT_INVALID,
      'Client certificate is invalid. Please check your certificate configuration.',
      'error',
      {originalMessage: message},
    );
  }

  // Authentication errors
  if (
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('401')
  ) {
    return createError(
      ErrorCode.UNAUTHORIZED,
      'Authentication failed. Please check your credentials.',
      'error',
      {originalMessage: message},
    );
  }

  if (
    message.toLowerCase().includes('credentials') ||
    message.toLowerCase().includes('auth')
  ) {
    return createError(
      ErrorCode.AUTH_FAILED,
      'Authentication failed. Please check your credentials and try again.',
      'error',
      {originalMessage: message},
    );
  }

  // Configuration errors
  if (message.toLowerCase().includes('config')) {
    return createError(
      ErrorCode.INVALID_CONFIG,
      'Invalid configuration. Please check your settings.',
      'error',
      {originalMessage: message},
    );
  }

  // Server errors (5xx)
  if (message.toLowerCase().includes('500') || error.name === 'ServerError') {
    return createError(
      ErrorCode.SERVER_ERROR,
      'Server error. Please try again later.',
      'error',
      {originalMessage: message},
    );
  }

  // Client errors (4xx)
  if (message.toLowerCase().includes('400') || error.name === 'ClientError') {
    return createError(
      ErrorCode.CLIENT_ERROR,
      'Invalid request. Please check your input and try again.',
      'error',
      {originalMessage: message},
    );
  }

  // Default: return generic error with original message
  return createError(
    ErrorCode.UNKNOWN,
    message || 'An unexpected error occurred',
    'error',
    {stack: error.stack},
  );
};

/**
 * Type guard to check if an error is already an AppError
 */
const isAppError = (error: unknown): error is AppError => {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      'severity' in error,
  );
};

/**
 * Handle an error by normalizing, logging, and optionally showing to user
 * Returns the normalized AppError for further handling
 */
export const handleError = async (
  error: unknown,
  context?: string,
  _options?: {
    showToUser?: boolean;
    logAsWarning?: boolean;
  },
): Promise<AppError> => {
  const appError = normalizeError(error);

  // Log the error
  if (appError.originalError) {
    SecureLogger.logError(appError.originalError, context);
  } else if (error instanceof Error) {
    SecureLogger.logError(error, context);
  }

  // Additional logging for error codes
  if (context) {
    SecureLogger.logRequest('ERROR', context);
  }

  return appError;
};

/**
 * Create user-friendly error message for UI display
 * Removes technical details and provides actionable advice
 */
export const getUserFriendlyMessage = (appError: AppError): string => {
  // Already in user-friendly format from normalization
  return appError.message;
};

/**
 * Get error severity for UI styling/alerts
 */
export const getErrorSeverityStyle = (
  severity: 'error' | 'warning' | 'info',
): {color: string; level: string} => {
  switch (severity) {
    case 'error':
      return {color: '#ff4444', level: 'error'};
    case 'warning':
      return {color: '#ffaa00', level: 'warning'};
    case 'info':
      return {color: '#0088ff', level: 'info'};
    default:
      return {color: '#666666', level: 'info'};
  }
};
