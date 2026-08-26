import React, {ReactNode} from 'react';
import {Text, View} from 'react-native';
import {useStyles} from '../helpers/colors';
import {AppError, ErrorCode, createError} from '../helpers/errorHandler';
import {SecureLogger} from '../helpers/secureLogger';

interface Props {
  children: ReactNode;
  fallback?: (error: AppError, retry: () => void) => ReactNode;
}

interface State {
  error: AppError | null;
  hasError: boolean;
}

/**
 * Error Boundary Component
 * Catches React component errors and displays user-friendly error UI
 * Prevents entire app crash from component errors
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {error: null, hasError: false};
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      error: createError(
        ErrorCode.UNKNOWN,
        'An error occurred in the application',
        'error',
        {originalError: error.message},
      ),
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error
    SecureLogger.logError(error, 'ErrorBoundary');

    // You can also log the componentStack here
    if (errorInfo.componentStack) {
      SecureLogger.logRequest('COMPONENT_ERROR', errorInfo.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({error: null, hasError: false});
  };

  render() {
    const {hasError, error} = this.state;

    if (hasError && error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(error, this.handleRetry);
      }

      // Default error UI
      return <ErrorBoundaryFallback error={error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

/**
 * Default Error Boundary Fallback UI
 */
const ErrorBoundaryFallback: React.FC<{
  error: AppError;
  onRetry: () => void;
}> = ({error, onRetry}) => {
  const styles = useStyles(({theme}) => ({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      backgroundColor: theme.background,
    },
    content: {
      alignItems: 'center',
      gap: 16,
    },
    errorIcon: {
      fontSize: 48,
      marginBottom: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.error || '#ff4444',
      textAlign: 'center',
    },
    message: {
      fontSize: 16,
      color: theme.text,
      textAlign: 'center',
      lineHeight: 24,
    },
    codeLabel: {
      fontSize: 12,
      color: theme.disabled,
      marginTop: 8,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: theme.link,
      borderRadius: 8,
    },
    retryText: {
      color: theme.background,
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  }));

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>{error.message}</Text>
        <Text style={styles.codeLabel}>Error Code: {error.code}</Text>

        <View
          style={styles.retryButton}
          onTouchEnd={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={styles.retryText}>Try Again</Text>
        </View>
      </View>
    </View>
  );
};
