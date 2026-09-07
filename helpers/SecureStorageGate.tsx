import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {Region} from '../store/settings';
import {SecureLogger} from './secureLogger';

type HydrationOperation = () => void | Promise<void>;
type HydrationLanguage = 'de' | 'en' | 'es' | 'fr' | 'it' | 'pl' | 'pt' | 'uk';

export interface SecureStorageGateProps {
  children: ReactNode;
  initialize: HydrationOperation;
  retry?: HydrationOperation;
  locale?: Region;
}

const hydrationMessages: Record<
  HydrationLanguage,
  {title: string; message: string; retry: string}
> = {
  de: {
    title: 'Sicherer Speicher nicht verfügbar',
    message:
      'Anmeldedaten konnten nicht sicher geladen werden. Bitte versuchen Sie es erneut.',
    retry: 'Erneut versuchen',
  },
  en: {
    title: 'Secure storage unavailable',
    message: 'Credentials could not be loaded securely. Please try again.',
    retry: 'Try again',
  },
  es: {
    title: 'Almacenamiento seguro no disponible',
    message:
      'No se pudieron cargar las credenciales de forma segura. Inténtalo de nuevo.',
    retry: 'Intentar de nuevo',
  },
  fr: {
    title: 'Stockage sécurisé indisponible',
    message:
      'Les identifiants n’ont pas pu être chargés de manière sécurisée. Réessayez.',
    retry: 'Réessayer',
  },
  it: {
    title: 'Archivio sicuro non disponibile',
    message:
      'Non è stato possibile caricare le credenziali in modo sicuro. Riprova.',
    retry: 'Riprova',
  },
  pl: {
    title: 'Bezpieczna pamięć niedostępna',
    message:
      'Nie udało się bezpiecznie wczytać danych logowania. Spróbuj ponownie.',
    retry: 'Spróbuj ponownie',
  },
  pt: {
    title: 'Armazenamento seguro indisponível',
    message:
      'Não foi possível carregar as credenciais com segurança. Tente novamente.',
    retry: 'Tentar novamente',
  },
  uk: {
    title: 'Захищене сховище недоступне',
    message: 'Не вдалося безпечно завантажити облікові дані. Спробуйте ще раз.',
    retry: 'Спробувати ще раз',
  },
};

const languageForRegion = (region?: Region): HydrationLanguage => {
  const language = region?.split('_')[0];
  return (
    (
      ['de', 'en', 'es', 'fr', 'it', 'pl', 'pt', 'uk'] as HydrationLanguage[]
    ).find(candidate => candidate === language) || 'en'
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: '#222',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#444',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1769aa',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const SecureStorageError = ({
  locale,
  onRetry,
}: {
  locale?: Region;
  onRetry: () => void;
}) => {
  const copy = hydrationMessages[languageForRegion(locale)];

  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>{copy.title}</Text>
      <Text style={styles.errorMessage}>{copy.message}</Text>
      <Pressable
        accessibilityLabel={copy.retry}
        accessibilityRole="button"
        onPress={onRetry}
        testID="secure-storage-retry"
        style={styles.retryButton}
      >
        <Text style={styles.retryLabel}>{copy.retry}</Text>
      </Pressable>
    </View>
  );
};

export const SecureStorageGate = ({
  children,
  initialize,
  retry = initialize,
  locale,
}: SecureStorageGateProps) => {
  const [phase, setPhase] = useState<
    'initializing' | 'failed' | 'ready'
  >('initializing');
  const attempt = useRef(0);

  const runInitialization = useCallback((operation: HydrationOperation) => {
    const currentAttempt = ++attempt.current;
    setPhase('initializing');

    Promise.resolve()
      .then(operation)
      .then(
        () => {
          if (attempt.current === currentAttempt) {
            setPhase('ready');
          }
        },
        error => {
          if (attempt.current !== currentAttempt) {
            return;
          }
          SecureLogger.logError(
            error instanceof Error
              ? error
              : new Error('Secure storage hydration failed'),
            'secure-storage-hydration',
          );
          setPhase('failed');
        },
      );
  }, []);

  useEffect(() => {
    runInitialization(initialize);
  }, [initialize, runInitialization]);

  const retryInitialization = useCallback(() => {
    runInitialization(retry);
  }, [retry, runInitialization]);

  if (phase === 'initializing') {
    return null;
  }

  if (phase === 'failed') {
    return <SecureStorageError locale={locale} onRetry={retryInitialization} />;
  }

  return <>{children}</>;
};

export const SafeHydrationGate = SecureStorageGate;
