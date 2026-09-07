import {Formik, FormikErrors, FormikHelpers, FormikProps} from 'formik';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Keyboard, Platform, Pressable, Text} from 'react-native';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import * as yup from 'yup';
import {Button, Switch, View} from 'react-native-ui-lib';
import {IconOutline} from '@ant-design/icons-react-native';
import {ScrollView} from 'react-native-gesture-handler';
import {Dropdown} from '../../components/forms/Dropdown';
import {Input} from '../../components/forms/Input';
import {Label} from '../../components/forms/Label';
import {Section} from '../../components/forms/Section';
import {useTheme, useStyles} from '../../helpers/colors';
import {clientCertManager} from '../../helpers/clientCertificates';
import {saveCredentials} from '../../helpers/secureStorage';
import {getUserFriendlyMessage, handleError} from '../../helpers/errorHandler';
import {
  ClientCertConfig,
  emptyServer,
  generateServerProfileId,
  LocalEndpoint,
  RouteTlsSettings,
  RtspSettings,
  Server,
} from '../../store/settings';
import {messages} from './messages';
import {InlineState} from '../../components/primitives';

interface ServerProps {
  server?: Server;
  onSubmit: (server: Server) => void | Promise<void>;
}

const formServer = (server?: Server): Server => {
  const empty = emptyServer();
  const emptyRtsp: RtspSettings = empty.rtsp || {
    enabled: false,
    port: 8554,
    allowInsecureCredentials: false,
  };
  const mtlsEnabled =
    server?.mtlsEnabled ?? Boolean(server?.clientCertConfig?.alias?.trim());
  const localClientCertAlias = server?.localTls?.clientCertConfig?.alias;
  const initialValues = {
    ...empty,
    ...server,
    mtlsEnabled,
    credentials: {
      ...empty.credentials,
      ...server?.credentials,
    },
    localRoutingEnabled: server?.localRoutingEnabled ?? false,
    localEndpoint: {
      ...{
        protocol: 'https' as const,
        host: '',
        port: 8971,
        basePath: '',
      },
      ...server?.localEndpoint,
    },
    localTls: {
      ...empty.localTls,
      ...server?.localTls,
      allowSelfSignedServer:
        server?.localTls?.allowSelfSignedServer ??
        server?.localTls?.clientCertConfig?.allowSelfSignedServer ??
        false,
      clientCertConfig:
        localClientCertAlias
          ? {alias: localClientCertAlias}
          : server?.clientCertConfig?.alias
            ? {alias: server.clientCertConfig.alias}
            : undefined,
    },
    rtsp: {
      ...emptyRtsp,
      ...server?.rtsp,
    },
  };
  if (!mtlsEnabled) {
    delete initialValues.clientCertConfig;
  }
  return mtlsEnabled
    ? {...initialValues, clientCertConfig: server?.clientCertConfig}
    : initialValues;
};

const ipv4Parts = (host: string): number[] | undefined => {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) {
    return undefined;
  }
  const numbers = parts.map(Number);
  return numbers.every(part => part >= 0 && part <= 255) ? numbers : undefined;
};

/**
 * Reject only addresses that are determinably public. Hostnames are left for
 * the resolver, which can enforce the actual network/peer policy.
 */
export const isDeterminablyPublicLocalHost = (value: string): boolean => {
  const host = value
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  const ipv4 = ipv4Parts(host);
  if (ipv4) {
    const [first, second] = ipv4;
    return !(
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 192 && second === 168) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  if (host.includes(':')) {
    return !(
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('::ffff:192.168.') ||
      host.startsWith('::ffff:10.')
    );
  }
  return false;
};

const containsControlCharacter = (value: string): boolean =>
  Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

const submittedServer = (server: Server): Server => {
  const mtlsEnabled = server.mtlsEnabled === true;
  const serverToSubmit = {
    ...server,
    profileId: server.profileId?.trim() || generateServerProfileId(),
    mtlsEnabled,
  };
  if (!mtlsEnabled) {
    delete serverToSubmit.clientCertConfig;
  }
  const localRouteEnabled =
    server.localRoutingEnabled === true && Boolean(server.localEndpoint);
  serverToSubmit.localRoutingEnabled = localRouteEnabled;
  if (!localRouteEnabled) {
    delete serverToSubmit.localEndpoint;
    serverToSubmit.localTls = {
      mtlsEnabled: false,
      allowSelfSignedServer: false,
    };
  } else {
    const localEndpoint = serverToSubmit.localEndpoint as LocalEndpoint;
    const localTls = serverToSubmit.localTls || {};
    const localAlias = localTls.clientCertConfig?.alias?.trim();
    const localMtlsEnabled =
      localEndpoint.protocol === 'https' &&
      localTls.mtlsEnabled === true &&
      Boolean(localAlias);
    serverToSubmit.localTls = {
      mtlsEnabled: localMtlsEnabled,
      allowSelfSignedServer:
        localEndpoint.protocol === 'https' &&
        localTls.allowSelfSignedServer === true,
      ...(localMtlsEnabled
        ? {clientCertConfig: {alias: localAlias as string}}
        : {}),
    };
  }
  const rtsp = serverToSubmit.rtsp;
  serverToSubmit.rtsp = {
    enabled: rtsp?.enabled === true,
    port:
      typeof rtsp?.port === 'number' &&
      Number.isSafeInteger(rtsp.port) &&
      rtsp.port > 0 &&
      rtsp.port <= 65535
        ? rtsp.port
        : 8554,
    allowInsecureCredentials:
      rtsp?.enabled === true && rtsp.allowInsecureCredentials === true,
  };
  return serverToSubmit;
};

export const ServerForm: NavigationFunctionComponent<ServerProps> = ({
  componentId,
  server,
  onSubmit,
}) => {
  const initialServerState = useMemo(() => formServer(server), [server]);

  const styles = useStyles(({theme}) => ({
    wrapper: {
      flex: 1,
      justifyContent: 'space-between',
    },
    scrollArea: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      width: '100%',
      flexGrow: 1,
      backgroundColor: theme.background,
    },
    header: {
      color: theme.text,
      fontSize: 22,
      fontWeight: 'bold',
    },
    tip: {
      color: theme.text,
    },
    help: {
      color: theme.text,
      marginBottom: 8,
    },
    certificateButton: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    certificateButtonText: {
      color: theme.link,
      fontSize: 13,
      fontWeight: '600',
    },
    certificateRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.surface,
      paddingLeft: 12,
      paddingRight: 4,
      marginBottom: 8,
    },
    certificateName: {
      flex: 1,
      color: theme.text,
      fontWeight: '600',
    },
    certificateFallback: {
      color: theme.textSecondary,
      fontWeight: '400',
    },
    certificateRemoveButton: {
      borderRadius: 24,
    },
    certificateRemoveIcon: {
      color: theme.error,
    },
    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    passwordInput: {
      flex: 1,
    },
    passwordToggle: {
      minHeight: 48,
      minWidth: 48,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 10,
    },
    footer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.background,
    },
    footerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    footerButton: {
      minWidth: 96,
      minHeight: 48,
    },
    formError: {
      color: theme.error,
      marginBottom: 8,
    },
  }));
  const theme = useTheme();

  const formRef = useRef<FormikProps<Server>>(null);
  const saveInFlight = useRef(false);
  const submitRequested = useRef(false);
  const certificateSelectionInFlight = useRef(false);
  const mounted = useRef(true);
  const [certificateSelectionPending, setCertificateSelectionPending] =
    useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const initialExpandedSections = useMemo(() => {
    const localEndpoint = initialServerState.localEndpoint as
      | LocalEndpoint
      | undefined;
    const localTls = initialServerState.localTls as
      | RouteTlsSettings
      | undefined;
    const rtsp = initialServerState.rtsp as RtspSettings | undefined;
    const localEndpointComplete =
      Boolean(localEndpoint?.host?.trim()) &&
      Number.isSafeInteger(localEndpoint?.port) &&
      Number(localEndpoint?.port) > 0 &&
      Number(localEndpoint?.port) <= 65535 &&
      !(/[?#]/.test(localEndpoint?.basePath || '') ||
        containsControlCharacter(localEndpoint?.basePath || ''));
    const localRouteNeedsAttention =
      initialServerState.localRoutingEnabled === true &&
      (!localEndpointComplete ||
        isDeterminablyPublicLocalHost(localEndpoint?.host || ''));
    const localTlsNeedsAttention =
      initialServerState.localRoutingEnabled === true &&
      localTls?.mtlsEnabled === true &&
      (localEndpoint?.protocol !== 'https' ||
        !localTls.clientCertConfig?.alias?.trim());
    const rtspNeedsAttention =
      rtsp?.enabled === true &&
      (!localRouteNeedsAttention &&
      initialServerState.localRoutingEnabled === true
        ? initialServerState.auth !== 'none' &&
          rtsp.allowInsecureCredentials !== true
        : true);
    const externalNeedsAttention =
      !initialServerState.protocol ||
      !initialServerState.host?.trim() ||
      (initialServerState.mtlsEnabled === true &&
        (initialServerState.protocol !== 'https' ||
          !initialServerState.clientCertConfig?.alias?.trim())) ||
      (initialServerState.auth !== 'none' &&
        (!initialServerState.credentials?.username?.trim() ||
          !initialServerState.credentials?.password));
    return {
      external: externalNeedsAttention,
      auth:
        initialServerState.auth !== 'none' &&
        !(
          initialServerState.credentials?.username?.trim() &&
          initialServerState.credentials?.password
        ),
      certificate:
        initialServerState.mtlsEnabled === true &&
        !initialServerState.clientCertConfig?.alias?.trim(),
      local: localRouteNeedsAttention,
      localCertificate: localTlsNeedsAttention,
      rtsp: rtspNeedsAttention,
    };
  }, [initialServerState]);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(initialExpandedSections);
  const intl = useIntl();

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const settingsValidationSchema = useMemo(() => {
    const requiredError = intl.formatMessage(messages['error.required']);
    const httpsError = intl.formatMessage(
      messages['server.mtls.httpsRequired'],
    );
    const localHttpsError = intl.formatMessage(
      messages['server.local.mtls.httpsRequired'],
    );
    const localPublicError = intl.formatMessage(
      messages['server.local.publicTarget'],
    );
    const localPortError = intl.formatMessage(
      messages['server.local.port.invalid'],
    );
    const endpointRequiredError = intl.formatMessage(
      messages['server.local.endpointRequired'],
    );
    const consentRequiredError = intl.formatMessage(
      messages['server.rtsp.credentialsConsentRequired'],
    );
    const localRouteRequiredError = intl.formatMessage(
      messages['server.rtsp.localRouteRequired'],
    );

    return yup.object().shape({
      protocol: yup
        .string()
        .required(requiredError)
        .test('mtls-https', httpsError, function (value) {
          return (
            !this.parent.mtlsEnabled ||
            value === 'https' ||
            this.createError({message: httpsError})
          );
        }),
      host: yup.string().required(requiredError),
      port: yup.number().nullable(),
      path: yup.string(),
      auth: yup.string(),
      credentials: yup.object().when('auth', {
        is: (val: 'none' | 'basic' | 'frigate') =>
          val === 'frigate' || val === 'basic',
        then: () =>
          yup.object().shape({
            username: yup.string().required(requiredError),
            password: yup.string().required(requiredError),
          }),
      }),
      mtlsEnabled: yup.boolean().required(requiredError),
      clientCertConfig: yup.object().when('mtlsEnabled', {
        is: true,
        then: schema =>
          schema.required(requiredError).shape({
            alias: yup.string().trim().required(requiredError),
          }),
        otherwise: schema => schema.notRequired(),
      }),
      localRoutingEnabled: yup.boolean().required(requiredError),
      localEndpoint: yup.object().when('localRoutingEnabled', {
        is: true,
        then: schema =>
          schema.required(endpointRequiredError).shape({
            protocol: yup
              .string()
              .oneOf(['http', 'https'])
              .required(requiredError),
            host: yup
              .string()
              .trim()
              .required(requiredError)
              .test('local-public-target', localPublicError, value =>
                value ? !isDeterminablyPublicLocalHost(value) : true,
              ),
            port: yup
              .number()
              .typeError(localPortError)
              .integer(localPortError)
              .min(1, localPortError)
              .max(65535, localPortError)
              .required(requiredError),
            basePath: yup
              .string()
              .test(
                'local-base-path',
                endpointRequiredError,
                value =>
                  !value ||
                  (!/[?#]/.test(value) && !containsControlCharacter(value)),
              ),
          }),
        otherwise: schema => schema.notRequired(),
      }),
      localTls: yup.object().when('localRoutingEnabled', {
        is: true,
        then: schema =>
          schema.shape({
            mtlsEnabled: yup
              .boolean()
              .test('local-mtls-https', localHttpsError, function (value) {
                return (
                  value !== true ||
                  this.options.context?.localProtocol === 'https' ||
                  this.parent?.protocol === 'https' ||
                  this.from?.[1]?.value?.localEndpoint?.protocol === 'https'
                );
              }),
            clientCertConfig: yup.object().when('mtlsEnabled', {
              is: true,
              then: certSchema =>
                certSchema
                  .required(requiredError)
                  .shape({alias: yup.string().trim().required(requiredError)}),
              otherwise: certSchema => certSchema.notRequired(),
            }),
          }),
        otherwise: schema => schema.notRequired(),
      }),
      rtsp: yup.object().shape({
        enabled: yup
          .boolean()
          .required(requiredError)
          .test('rtsp-local-route', localRouteRequiredError, function (value) {
            return (
              value !== true ||
              this.from?.[1]?.value?.localRoutingEnabled === true
            );
          }),
        port: yup
          .number()
          .typeError(localPortError)
          .integer(localPortError)
          .min(1, localPortError)
          .max(65535, localPortError)
          .required(requiredError),
        allowInsecureCredentials: yup
          .boolean()
          .required(requiredError)
          .test(
            'plaintext-credentials-consent',
            consentRequiredError,
            function (value) {
              const root = this.from?.[1]?.value as Server | undefined;
              return (
                !(root?.rtsp?.enabled === true && root.auth !== 'none') ||
                value === true
              );
            },
          ),
      }),
    });
  }, [intl]);

  const cancel = useCallback(() => {
    void Promise.resolve(Navigation.dismissModal(componentId)).catch(error => {
      void handleError(error, 'navigation.dismiss-server-form');
    });
  }, [componentId]);

  const save = useCallback(
    async (
      modifiedServer: Server,
      helpers: FormikHelpers<Server>,
    ): Promise<void> => {
      if (saveInFlight.current) {
        return;
      }
      saveInFlight.current = true;
      helpers.setStatus(undefined);
      try {
        const serverToSubmit = submittedServer(modifiedServer);
        if (serverToSubmit.auth !== 'none' && serverToSubmit.credentials) {
          if (!serverToSubmit.profileId) {
            throw new Error('Server profile identifier is unavailable');
          }
          await saveCredentials(
            serverToSubmit.profileId,
            serverToSubmit.credentials,
          );
        }

        if (!mounted.current) {
          return;
        }
        await onSubmit(serverToSubmit);
        Keyboard.dismiss();
        void Promise.resolve(Navigation.dismissModal(componentId)).catch(
          error => {
            void handleError(error, 'navigation.dismiss-server-form');
          },
        );
      } catch (error) {
        const appError = await handleError(error, 'saving-server', {
          showToUser: true,
        });
        if (mounted.current) {
          helpers.setStatus(getUserFriendlyMessage(appError));
        }
      } finally {
        saveInFlight.current = false;
        if (mounted.current) {
          helpers.setSubmitting(false);
        }
      }
    },
    [componentId, onSubmit],
  );

  const sectionForPath = (path?: string) => {
    if (!path) {
      return 'external';
    }
    if (path.startsWith('credentials') || path === 'auth') {
      return 'auth';
    }
    if (path.startsWith('clientCertConfig') || path === 'mtlsEnabled') {
      return 'certificate';
    }
    if (
      path.startsWith('localTls') ||
      path.startsWith('localEndpoint') ||
      path === 'localRoutingEnabled'
    ) {
      return 'local';
    }
    if (path.startsWith('rtsp')) {
      return 'rtsp';
    }
    return 'external';
  };

  const validateBeforeSubmit = useCallback(
    (values: Server) => {
      if (submitRequested.current) {
        try {
          settingsValidationSchema.validateSync(values, {abortEarly: false});
        } catch (error) {
          const validationError = error as yup.ValidationError;
          const paths = validationError.inner
            ?.map(validation => validation.path)
            .filter((path): path is string => Boolean(path));
          const hasPath = (prefix: string) =>
            paths?.some(path => path === prefix || path.startsWith(`${prefix}.`));
          let section = sectionForPath(paths?.[0]);
          if (
            values.mtlsEnabled === true &&
            values.protocol !== 'https' &&
            hasPath('protocol')
          ) {
            section = 'certificate';
          } else if (hasPath('localTls')) {
            section = 'localCertificate';
          } else if (hasPath('rtsp')) {
            section = 'rtsp';
          }
          setTimeout(() => {
            if (mounted.current) {
              setExpandedSections(current => ({
                ...current,
                [section]: true,
                ...(section === 'localCertificate' ? {local: true} : {}),
              }));
            }
          }, 0);
        }
      }
      return {};
    },
    [settingsValidationSchema],
  );

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(current => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  return (
    <Formik
      initialValues={initialServerState}
      validationSchema={settingsValidationSchema}
      validate={validateBeforeSubmit}
      onSubmit={save}
      innerRef={formRef}
    >
      {({
        values,
        handleBlur,
        handleChange,
        setFieldTouched,
        setFieldValue,
        errors,
        touched,
        isSubmitting,
        status,
      }) => {
        const credentialsTouched = touched.credentials as
          | {username?: boolean; password?: boolean}
          | undefined;
        const credentialsErrors = errors.credentials as
          | FormikErrors<Server['credentials']>
          | undefined;
        const clientCertTouched = touched.clientCertConfig as
          | {alias?: boolean}
          | undefined;
        const clientCertFieldTouched =
          typeof touched.clientCertConfig === 'boolean'
            ? touched.clientCertConfig
            : clientCertTouched?.alias;
        const clientCertErrors = errors.clientCertConfig as
          | {alias?: string}
          | string
          | undefined;
        const clientCertObjectError =
          typeof clientCertErrors === 'string' ? clientCertErrors : undefined;
        const clientCertAliasError =
          typeof clientCertErrors === 'object'
            ? clientCertErrors?.alias
            : undefined;
        const localEndpointErrors = errors.localEndpoint as
          | FormikErrors<LocalEndpoint>
          | undefined;
        const localTlsErrors = errors.localTls as
          | FormikErrors<RouteTlsSettings>
          | undefined;
        const rtspErrors = errors.rtsp as
          | FormikErrors<RtspSettings>
          | undefined;
        const localEndpoint = values.localEndpoint as LocalEndpoint | undefined;
        const localTls = values.localTls as RouteTlsSettings | undefined;
        const rtsp = values.rtsp as RtspSettings | undefined;
        const formatSummary = (key: keyof typeof messages) =>
          intl.formatMessage(messages[key]);
        const externalNeedsAttention = Boolean(errors.protocol || errors.host);
        const externalConfigured =
          Boolean(values.protocol) && Boolean(values.host?.trim());
        const authNeedsAttention = Boolean(
          errors.auth ||
            credentialsErrors?.username ||
            credentialsErrors?.password,
        );
        const authConfigured =
          values.auth === 'none' ||
          Boolean(
            values.credentials?.username?.trim() &&
              values.credentials?.password,
          );
        const certificateNeedsAttention = Boolean(
          errors.mtlsEnabled ||
            clientCertAliasError ||
            clientCertObjectError ||
            (values.mtlsEnabled === true && values.protocol !== 'https'),
        );
        const localEndpointHasErrors = Boolean(
          localEndpointErrors?.protocol ||
            localEndpointErrors?.host ||
            localEndpointErrors?.port ||
            localEndpointErrors?.basePath,
        );
        const localEndpointComplete =
          localEndpoint?.protocol !== undefined &&
          Boolean(localEndpoint.host?.trim()) &&
          Number.isSafeInteger(localEndpoint.port) &&
          localEndpoint.port > 0 &&
          localEndpoint.port <= 65535 &&
          (!localEndpoint.basePath ||
            (!/[?#]/.test(localEndpoint.basePath) &&
              !containsControlCharacter(localEndpoint.basePath)));
        const localNeedsAttention =
          Boolean(errors.localRoutingEnabled) ||
          localEndpointHasErrors ||
          Boolean(
            localEndpoint?.basePath &&
              (/[?#]/.test(localEndpoint.basePath) ||
                containsControlCharacter(localEndpoint.basePath)),
          ) ||
          Boolean(
            values.localRoutingEnabled &&
              localEndpoint?.host &&
              isDeterminablyPublicLocalHost(localEndpoint.host),
          );
        const localTlsNeedsAttention =
          Boolean(
            localTlsErrors?.mtlsEnabled ||
              (
                localTlsErrors?.clientCertConfig as
                  | FormikErrors<ClientCertConfig>
                  | undefined
              )?.alias,
          ) ||
          Boolean(
            localTls?.mtlsEnabled === true &&
              localEndpoint?.protocol !== 'https',
          );
        const rtspNeedsAttention = Boolean(
          (rtspErrors as FormikErrors<RtspSettings> | undefined)?.enabled ||
            (rtspErrors as FormikErrors<RtspSettings> | undefined)?.port ||
            (rtspErrors as FormikErrors<RtspSettings> | undefined)
              ?.allowInsecureCredentials,
        );
        const localSummary = !values.localRoutingEnabled
          ? formatSummary('server.summary.disabled')
          : localNeedsAttention
            ? values.localRoutingEnabled &&
              localEndpoint?.host &&
              isDeterminablyPublicLocalHost(localEndpoint.host)
              ? formatSummary('server.summary.local.privateTarget')
              : formatSummary('server.summary.local.endpointIncomplete')
            : !localEndpointComplete
              ? formatSummary('server.summary.local.endpointIncomplete')
              : localEndpoint?.protocol === 'http'
                ? formatSummary('server.summary.local.http')
                : formatSummary('server.summary.configured');
        const localTlsSummary =
          localTls?.mtlsEnabled !== true
            ? formatSummary('server.summary.disabled')
            : localEndpoint?.protocol !== 'https'
              ? formatSummary('server.summary.local.tlsHttps')
              : localTlsNeedsAttention
                ? formatSummary('server.summary.local.tlsCertificate')
                : localTls.clientCertConfig?.alias
                  ? formatSummary('server.summary.configured')
                  : formatSummary('server.summary.local.tlsCertificate');
        const localRouteValid =
          values.localRoutingEnabled === true &&
          localEndpointComplete &&
          Boolean(localEndpoint?.host) &&
          !isDeterminablyPublicLocalHost(localEndpoint.host);
        const rtspSummary =
          rtsp?.enabled !== true
            ? formatSummary('server.summary.disabled')
            : rtspNeedsAttention
              ? formatSummary('server.summary.needsAttention')
              : !localRouteValid
                ? formatSummary('server.summary.needsValidLocalRoute')
                : values.auth !== 'none' &&
                    rtsp.allowInsecureCredentials !== true
                  ? formatSummary('server.summary.needsConsent')
                  : formatSummary('server.summary.configured');

        const togglePasswordVisibility = () => {
          setPasswordVisible(current => !current);
        };

        const renderCertificateRow = ({
          alias,
          fallback,
          chooseLabel,
          chooseShortLabel,
          changeLabel,
          removeLabel,
          onChoose,
          onRemove,
          testID,
        }: {
          alias?: string;
          fallback: string;
          chooseLabel: string;
          chooseShortLabel: string;
          changeLabel: string;
          removeLabel: string;
          onChoose: () => void;
          onRemove?: () => void;
          testID: string;
        }) => {
          const displayAlias = alias?.trim();
          return (
            <View style={styles.certificateRow} testID={testID}>
              <Text
                style={[
                  styles.certificateName,
                  !displayAlias && styles.certificateFallback,
                ]}
                numberOfLines={1}
                ellipsizeMode="middle"
                testID={`${testID}-name`}
              >
                {displayAlias || fallback}
              </Text>
              <Pressable
                style={styles.certificateButton}
                disabled={certificateSelectionPending}
                accessibilityRole="button"
                accessibilityLabel={displayAlias ? changeLabel : chooseLabel}
                accessibilityHint={displayAlias ? changeLabel : chooseLabel}
                onPress={onChoose}
                testID={`${testID}-change`}
              >
                <IconOutline
                  name={displayAlias ? 'edit' : 'plus'}
                  color={theme.link}
                  size={20}
                  accessible={false}
                />
                {!displayAlias && (
                  <Text style={styles.certificateButtonText}>
                    {chooseShortLabel}
                  </Text>
                )}
              </Pressable>
              {displayAlias && onRemove && (
                <Pressable
                  style={[
                    styles.certificateButton,
                    styles.certificateRemoveButton,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={removeLabel}
                  accessibilityHint={removeLabel}
                  onPress={onRemove}
                  testID={`${testID}-remove`}
                >
                  <IconOutline
                    name="delete"
                    color={theme.error}
                    size={20}
                    accessible={false}
                  />
                </Pressable>
              )}
            </View>
          );
        };

        return (
          <View style={styles.wrapper}>
            <ScrollView contentContainerStyle={styles.scrollArea}>
              <Text style={styles.header}>
                {intl.formatMessage(messages['server.header'])}
              </Text>
              <Section
                header={intl.formatMessage(messages['server.external.header'])}
                testID="server-section-external"
                compact
                expanded={expandedSections.external}
                onToggle={() => toggleSection('external')}
                summary={
                  externalNeedsAttention
                    ? formatSummary('server.summary.needsAttention')
                    : externalConfigured
                      ? formatSummary('server.summary.configured')
                      : formatSummary('server.summary.needsSetup')
                }
                invalid={externalNeedsAttention}
              >
                <Label
                  text={intl.formatMessage(messages['server.protocol.label'])}
                  touched={touched.protocol}
                  error={errors.protocol}
                  required={true}
                >
                  <Dropdown
                    value={values.protocol}
                    options={[
                      {value: 'http', label: 'http'},
                      {value: 'https', label: 'https'},
                    ]}
                    accessibilityLabel={intl.formatMessage(
                      messages['server.protocol.label'],
                    )}
                    onValueChange={handleChange('protocol')}
                  />
                </Label>
                <Label
                  text={intl.formatMessage(messages['server.host.label'])}
                  touched={touched.host}
                  error={errors.host}
                  required={true}
                >
                  <Input
                    value={values.host}
                    accessibilityLabel={intl.formatMessage(
                      messages['server.host.label'],
                    )}
                    onBlur={handleBlur('host')}
                    onChangeText={handleChange('host')}
                    keyboardType="default"
                  />
                </Label>
                <Label
                  text={intl.formatMessage(messages['server.port.label'])}
                  touched={touched.port}
                  error={errors.port}
                >
                  <Input
                    value={`${values.port || ''}`}
                    accessibilityLabel={intl.formatMessage(
                      messages['server.port.label'],
                    )}
                    onBlur={handleBlur('port')}
                    onChangeText={(value: string) =>
                      setFieldValue('port', parseFloat(value) || null)
                    }
                    keyboardType="numeric"
                  />
                </Label>
                <Label
                  text={intl.formatMessage(messages['server.path.label'])}
                  touched={touched.path}
                  error={errors.path}
                >
                  <Input
                    value={values.path}
                    accessibilityLabel={intl.formatMessage(
                      messages['server.path.label'],
                    )}
                    onBlur={handleBlur('path')}
                    onChangeText={handleChange('path')}
                    keyboardType="default"
                  />
                </Label>
              </Section>
              <Section
                header={intl.formatMessage(
                  messages['server.auth.progressiveHeader'],
                )}
                testID="server-section-auth"
                compact
                expanded={expandedSections.auth}
                onToggle={() => toggleSection('auth')}
                summary={
                  authNeedsAttention
                    ? formatSummary('server.summary.needsAttention')
                    : values.auth === 'none'
                      ? formatSummary('server.summary.disabled')
                      : authConfigured
                        ? formatSummary('server.summary.configured')
                        : formatSummary('server.summary.needsSetup')
                }
                invalid={authNeedsAttention}
              >
                <Label
                  text={intl.formatMessage(messages['server.auth.label'])}
                  touched={touched.auth}
                  error={errors.auth}
                >
                  <Dropdown
                    value={values.auth}
                    options={[
                      {
                        value: 'none',
                        label: intl.formatMessage(
                          messages['server.auth.option.none'],
                        ),
                      },
                      {
                        value: 'basic',
                        label: intl.formatMessage(
                          messages['server.auth.option.basic'],
                        ),
                      },
                      {
                        value: 'frigate',
                        label: intl.formatMessage(
                          messages['server.auth.option.frigate'],
                        ),
                      },
                    ]}
                    accessibilityLabel={intl.formatMessage(
                      messages['server.auth.label'],
                    )}
                    onValueChange={(value: string) => {
                      handleChange('auth')(value);
                      if (value !== 'none') {
                        setExpandedSections(current => ({
                          ...current,
                          auth: true,
                        }));
                      }
                    }}
                  />
                </Label>
                {values.auth !== 'none' && (
                  <>
                    <Label
                      text={intl.formatMessage(
                        messages['server.username.label'],
                      )}
                      touched={credentialsTouched?.username}
                      error={credentialsErrors?.username}
                      required={true}
                    >
                      <Input
                        value={values.credentials?.username}
                        accessibilityLabel={intl.formatMessage(
                          messages['server.username.label'],
                        )}
                        onBlur={handleBlur('credentials.username')}
                        onChangeText={handleChange('credentials.username')}
                        keyboardType="default"
                      />
                    </Label>
                    <Label
                      text={intl.formatMessage(
                        messages['server.password.label'],
                      )}
                      touched={credentialsTouched?.password}
                      error={credentialsErrors?.password}
                      required={true}
                    >
                      <View style={styles.passwordRow}>
                        <Input
                          style={styles.passwordInput}
                          value={values.credentials?.password}
                          accessibilityLabel={intl.formatMessage(
                            messages['server.password.label'],
                          )}
                          onBlur={handleBlur('credentials.password')}
                          onChangeText={handleChange('credentials.password')}
                          keyboardType="default"
                          secureTextEntry={!passwordVisible}
                        />
                        <Pressable
                          style={styles.passwordToggle}
                          accessibilityRole="button"
                          accessibilityState={{selected: passwordVisible}}
                          accessibilityLabel={intl.formatMessage(
                            messages[
                              passwordVisible
                                ? 'server.password.hide'
                                : 'server.password.show'
                            ],
                          )}
                          testID="server-password-toggle"
                          onPress={togglePasswordVisibility}
                        >
                          <IconOutline
                            name={passwordVisible ? 'eye-invisible' : 'eye'}
                            color={theme.link}
                            size={22}
                            accessible={false}
                          />
                        </Pressable>
                      </View>
                    </Label>
                  </>
                )}
              </Section>
              {Platform.OS === 'android' && (
                <Section
                  header={intl.formatMessage(
                    messages['server.mtls.progressiveHeader'],
                  )}
                  testID="server-section-certificate"
                  compact
                  expanded={expandedSections.certificate}
                  onToggle={() => toggleSection('certificate')}
                  summary={
                    !values.mtlsEnabled
                      ? formatSummary('server.summary.disabled')
                      : certificateNeedsAttention
                        ? formatSummary('server.summary.needsAttention')
                        : values.clientCertConfig?.alias
                          ? formatSummary('server.summary.configured')
                          : formatSummary('server.summary.needsSetup')
                  }
                  invalid={certificateNeedsAttention}
                >
                  <Label
                    text={intl.formatMessage(messages['server.mtls.enabled'])}
                    touched={touched.mtlsEnabled}
                    error={errors.mtlsEnabled}
                  >
                    <Switch
                      testID="server-mtls-toggle"
                      value={values.mtlsEnabled === true}
                      accessibilityLabel={intl.formatMessage(
                        messages['server.mtls.enabled'],
                      )}
                      accessibilityState={{
                        checked: values.mtlsEnabled === true,
                      }}
                      onValueChange={(enabled: boolean) => {
                        void setFieldValue('mtlsEnabled', enabled);
                        if (enabled) {
                          setExpandedSections(current => ({
                            ...current,
                            certificate: true,
                          }));
                        }
                        if (!enabled) {
                          void setFieldValue('clientCertConfig', undefined);
                        }
                      }}
                    />
                  </Label>
                  {values.mtlsEnabled === true && (
                    <>
                      <Label
                        text={intl.formatMessage(
                          messages['server.mtls.certificate.label'],
                        )}
                        touched={clientCertFieldTouched}
                        error={clientCertAliasError}
                      >
                        {renderCertificateRow({
                          alias: values.clientCertConfig?.alias,
                          fallback: intl.formatMessage(
                            messages['server.mtls.certificate.none'],
                          ),
                          chooseLabel: intl.formatMessage(
                            messages['server.mtls.certificate.choose'],
                          ),
                          chooseShortLabel: intl.formatMessage(
                            messages['server.mtls.certificate.chooseShort'],
                          ),
                          changeLabel: intl.formatMessage(
                            messages['server.mtls.certificate.change'],
                          ),
                          removeLabel: intl.formatMessage(
                            messages['server.mtls.certificate.remove'],
                          ),
                          onChoose: () => {
                            if (certificateSelectionInFlight.current) {
                              return;
                            }
                            void setFieldTouched(
                              'clientCertConfig.alias',
                              true,
                            );
                            certificateSelectionInFlight.current = true;
                            setCertificateSelectionPending(true);
                            void clientCertManager
                              .selectCertificate(values.clientCertConfig?.alias)
                              .then(alias => {
                                if (mounted.current && alias) {
                                  const nextClientCertConfig: ClientCertConfig =
                                    {
                                      alias,
                                      allowSelfSignedServer:
                                        values.clientCertConfig
                                          ?.allowSelfSignedServer ?? false,
                                    };
                                  void setFieldValue(
                                    'clientCertConfig',
                                    nextClientCertConfig,
                                  );
                                }
                              })
                              .catch(async error => {
                                const appError = await handleError(
                                  error,
                                  'ServerForm.selectCertificate',
                                  {showToUser: true},
                                );
                                if (mounted.current) {
                                  formRef.current?.setStatus(
                                    getUserFriendlyMessage(appError),
                                  );
                                }
                              })
                              .finally(() => {
                                certificateSelectionInFlight.current = false;
                                if (mounted.current) {
                                  setCertificateSelectionPending(false);
                                }
                              });
                          },
                          onRemove: () =>
                            Alert.alert(
                              intl.formatMessage(
                                messages[
                                  'server.mtls.certificate.remove.title'
                                ],
                              ),
                              intl.formatMessage(
                                messages[
                                  'server.mtls.certificate.remove.message'
                                ],
                              ),
                              [
                                {
                                  text: intl.formatMessage(
                                    messages[
                                      'server.mtls.certificate.remove.cancel'
                                    ],
                                  ),
                                  style: 'cancel',
                                },
                                {
                                  text: intl.formatMessage(
                                    messages[
                                      'server.mtls.certificate.remove.confirm'
                                    ],
                                  ),
                                  style: 'destructive',
                                  onPress: () => {
                                    void setFieldValue(
                                      'clientCertConfig',
                                      undefined,
                                    );
                                    void setFieldTouched(
                                      'clientCertConfig.alias',
                                      true,
                                    );
                                  },
                                },
                              ],
                            ),
                          testID: 'server-mtls-certificate',
                        })}
                      </Label>
                      {clientCertObjectError && (
                        <Text style={styles.formError}>
                          {clientCertObjectError}
                        </Text>
                      )}
                      <Label
                        text={intl.formatMessage(
                          messages['server.mtls.selfSigned.label'],
                        )}
                      >
                        <Switch
                          testID="server-mtls-self-signed-toggle"
                          value={
                            values.clientCertConfig?.allowSelfSignedServer ??
                            false
                          }
                          accessibilityLabel={intl.formatMessage(
                            messages['server.mtls.selfSigned.label'],
                          )}
                          accessibilityState={{
                            checked:
                              values.clientCertConfig?.allowSelfSignedServer ??
                              false,
                          }}
                          onValueChange={(allowSelfSignedServer: boolean) => {
                            void setFieldValue('clientCertConfig', {
                              ...(values.clientCertConfig || {alias: ''}),
                              allowSelfSignedServer,
                            });
                          }}
                        />
                      </Label>
                      <Text style={styles.tip}>
                        {intl.formatMessage(messages['server.mtls.help'])}
                      </Text>
                    </>
                  )}
                </Section>
              )}
              <Section
                header={intl.formatMessage(
                  messages['server.local.progressiveHeader'],
                )}
                testID="server-section-local"
                compact
                expanded={expandedSections.local}
                onToggle={() => toggleSection('local')}
                summary={localSummary}
                invalid={localNeedsAttention}
              >
                <Label
                  text={intl.formatMessage(messages['server.local.enabled'])}
                  touched={touched.localRoutingEnabled}
                  error={errors.localRoutingEnabled}
                >
                  <Switch
                    testID="server-local-route-toggle"
                    value={values.localRoutingEnabled === true}
                    accessibilityLabel={intl.formatMessage(
                      messages['server.local.enabled'],
                    )}
                    onValueChange={(enabled: boolean) => {
                      void setFieldValue('localRoutingEnabled', enabled);
                      if (enabled) {
                        setExpandedSections(current => ({
                          ...current,
                          local: true,
                        }));
                      }
                      if (enabled && !values.localEndpoint) {
                        void setFieldValue('localEndpoint', {
                          protocol: 'https',
                          host: '',
                          port: 8971,
                          basePath: '',
                        });
                      }
                    }}
                  />
                </Label>
                <Text style={styles.help}>
                  {intl.formatMessage(messages['server.local.help'])}
                </Text>
                {values.localRoutingEnabled === true && localEndpoint && (
                  <>
                    <Label
                      text={intl.formatMessage(
                        messages['server.local.protocol.label'],
                      )}
                      touched={localEndpointErrors?.protocol !== undefined}
                      error={localEndpointErrors?.protocol as string}
                      required={true}
                    >
                      <Dropdown
                        value={localEndpoint.protocol}
                        options={[
                          {value: 'http', label: 'http'},
                          {value: 'https', label: 'https'},
                        ]}
                        accessibilityLabel={intl.formatMessage(
                          messages['server.local.protocol.label'],
                        )}
                        testID="server-local-protocol"
                        onValueChange={(protocol: 'http' | 'https') =>
                          setFieldValue('localEndpoint.protocol', protocol)
                        }
                      />
                    </Label>
                    <Label
                      text={intl.formatMessage(
                        messages['server.local.host.label'],
                      )}
                      touched={Boolean(
                        (
                          touched.localEndpoint as unknown as FormikErrors<LocalEndpoint>
                        )?.host,
                      )}
                      error={localEndpointErrors?.host as string}
                      required={true}
                    >
                      <Input
                        value={localEndpoint.host}
                        accessibilityLabel={intl.formatMessage(
                          messages['server.local.host.label'],
                        )}
                        testID="server-local-host"
                        onBlur={handleBlur('localEndpoint.host')}
                        onChangeText={handleChange('localEndpoint.host')}
                      />
                    </Label>
                    <Label
                      text={intl.formatMessage(
                        messages['server.local.port.label'],
                      )}
                      touched={Boolean(
                        (
                          touched.localEndpoint as unknown as FormikErrors<LocalEndpoint>
                        )?.port,
                      )}
                      error={localEndpointErrors?.port as string}
                      required={true}
                    >
                      <Input
                        value={`${localEndpoint.port || ''}`}
                        accessibilityLabel={intl.formatMessage(
                          messages['server.local.port.label'],
                        )}
                        testID="server-local-port"
                        onBlur={handleBlur('localEndpoint.port')}
                        onChangeText={(value: string) =>
                          setFieldValue(
                            'localEndpoint.port',
                            parseFloat(value) || null,
                          )
                        }
                        keyboardType="numeric"
                      />
                    </Label>
                    <Label
                      text={intl.formatMessage(
                        messages['server.local.path.label'],
                      )}
                      touched={Boolean(
                        (
                          touched.localEndpoint as unknown as FormikErrors<LocalEndpoint>
                        )?.basePath,
                      )}
                      error={localEndpointErrors?.basePath as string}
                    >
                      <Input
                        value={localEndpoint.basePath}
                        accessibilityLabel={intl.formatMessage(
                          messages['server.local.path.label'],
                        )}
                        testID="server-local-base-path"
                        onBlur={handleBlur('localEndpoint.basePath')}
                        onChangeText={handleChange('localEndpoint.basePath')}
                      />
                    </Label>
                    {localEndpoint.protocol === 'http' && (
                      <InlineState
                        icon="warning"
                        tone="warning"
                        title={intl.formatMessage(
                          messages['server.local.httpWarning'],
                        )}
                        testID="server-local-http-warning"
                      />
                    )}
                  </>
                )}
              </Section>
              {values.localRoutingEnabled === true && (
                <>
                  {Platform.OS === 'android' && (
                    <Section
                      header={intl.formatMessage(
                        messages['server.local.mtls.header'],
                      )}
                      testID="server-section-local-trust"
                      compact
                      expanded={expandedSections.localCertificate}
                      onToggle={() => toggleSection('localCertificate')}
                      summary={
                        localTlsSummary
                      }
                      invalid={localTlsNeedsAttention}
                    >
                      <Label
                        text={intl.formatMessage(
                          messages['server.local.mtls.enabled'],
                        )}
                        touched={Boolean(localTlsErrors?.mtlsEnabled)}
                        error={localTlsErrors?.mtlsEnabled as string}
                      >
                        <Switch
                          testID="server-local-mtls-toggle"
                          value={localTls?.mtlsEnabled === true}
                          accessibilityRole="switch"
                          accessibilityLabel={intl.formatMessage(
                            messages['server.local.mtls.enabled'],
                          )}
                          accessibilityState={{
                            checked: localTls?.mtlsEnabled === true,
                          }}
                          onValueChange={(enabled: boolean) => {
                            void setFieldValue('localTls', {
                              ...(localTls || {}),
                              mtlsEnabled: enabled,
                            });
                            if (enabled) {
                              setExpandedSections(current => ({
                                ...current,
                                localCertificate: true,
                              }));
                            }
                          }}
                        />
                      </Label>
                      {localTls?.mtlsEnabled === true && (
                        <>
                          <Label
                            text={intl.formatMessage(
                              messages['server.local.mtls.certificate.label'],
                            )}
                            touched={Boolean(
                              (
                                localTlsErrors?.clientCertConfig as
                                  | FormikErrors<ClientCertConfig>
                                  | undefined
                              )?.alias,
                            )}
                            error={
                              (
                                localTlsErrors?.clientCertConfig as
                                  | FormikErrors<ClientCertConfig>
                                  | undefined
                              )?.alias as string
                            }
                            required={true}
                          >
                            {renderCertificateRow({
                              alias: localTls.clientCertConfig?.alias,
                              fallback: intl.formatMessage(
                                messages['server.local.mtls.certificate.none'],
                              ),
                              chooseLabel: intl.formatMessage(
                                messages[
                                  'server.local.mtls.certificate.choose'
                                ],
                              ),
                              chooseShortLabel: intl.formatMessage(
                                messages[
                                  'server.local.mtls.certificate.chooseShort'
                                ],
                              ),
                              changeLabel: intl.formatMessage(
                                messages[
                                  'server.local.mtls.certificate.change'
                                ],
                              ),
                              removeLabel: intl.formatMessage(
                                messages[
                                  'server.local.mtls.certificate.remove'
                                ],
                              ),
                              onChoose: () => {
                                if (certificateSelectionInFlight.current) {
                                  return;
                                }
                                certificateSelectionInFlight.current = true;
                                setCertificateSelectionPending(true);
                                void clientCertManager
                                  .selectCertificate(
                                    localTls.clientCertConfig?.alias,
                                  )
                                  .then(alias => {
                                    if (mounted.current && alias) {
                                      void setFieldValue('localTls', {
                                        ...(localTls || {}),
                                        clientCertConfig: {alias},
                                      });
                                    }
                                  })
                                  .catch(async error => {
                                    const appError = await handleError(
                                      error,
                                      'ServerForm.selectLocalCertificate',
                                      {showToUser: true},
                                    );
                                    if (mounted.current) {
                                      formRef.current?.setStatus(
                                        getUserFriendlyMessage(appError),
                                      );
                                    }
                                  })
                                  .finally(() => {
                                    certificateSelectionInFlight.current =
                                      false;
                                    if (mounted.current) {
                                      setCertificateSelectionPending(false);
                                    }
                                  });
                              },
                              onRemove: () =>
                                Alert.alert(
                                  intl.formatMessage(
                                    messages[
                                      'server.local.mtls.certificate.remove.title'
                                    ],
                                  ),
                                  intl.formatMessage(
                                    messages[
                                      'server.local.mtls.certificate.remove.message'
                                    ],
                                  ),
                                  [
                                    {
                                      text: intl.formatMessage(
                                        messages[
                                          'server.local.mtls.certificate.remove.cancel'
                                        ],
                                      ),
                                      style: 'cancel',
                                    },
                                    {
                                      text: intl.formatMessage(
                                        messages[
                                          'server.local.mtls.certificate.remove.confirm'
                                        ],
                                      ),
                                      style: 'destructive',
                                      onPress: () => {
                                        void setFieldValue('localTls', {
                                          ...(localTls || {}),
                                          clientCertConfig: undefined,
                                        });
                                      },
                                    },
                                  ],
                                ),
                              testID: 'server-local-mtls-certificate',
                            })}
                          </Label>
                          <Label
                            text={intl.formatMessage(
                              messages['server.local.mtls.selfSigned.label'],
                            )}
                          >
                            <Switch
                              testID="server-local-mtls-self-signed-toggle"
                              value={
                                localTls.allowSelfSignedServer === true
                              }
                              accessibilityRole="switch"
                              accessibilityLabel={intl.formatMessage(
                                messages['server.local.mtls.selfSigned.label'],
                              )}
                              accessibilityState={{
                                checked:
                                  localTls.allowSelfSignedServer === true,
                              }}
                              onValueChange={allowSelfSignedServer => {
                                void setFieldValue('localTls', {
                                  ...(localTls || {}),
                                  allowSelfSignedServer,
                                });
                              }}
                            />
                          </Label>
                          <Text style={styles.tip}>
                            {intl.formatMessage(
                              messages['server.local.mtls.help'],
                            )}
                          </Text>
                        </>
                      )}
                    </Section>
                  )}
                  <Section
                    header={intl.formatMessage(
                      messages['server.rtsp.progressiveHeader'],
                    )}
                    testID="server-section-rtsp"
                    compact
                    expanded={expandedSections.rtsp}
                    onToggle={() => toggleSection('rtsp')}
                    summary={rtspSummary}
                    invalid={rtspNeedsAttention}
                  >
                    <Label
                      text={intl.formatMessage(messages['server.rtsp.enabled'])}
                      touched={Boolean(rtspErrors?.enabled)}
                      error={rtspErrors?.enabled as string}
                    >
                      <Switch
                        testID="server-rtsp-toggle"
                        value={rtsp?.enabled === true}
                        accessibilityRole="switch"
                        accessibilityLabel={intl.formatMessage(
                          messages['server.rtsp.enabled'],
                        )}
                        accessibilityState={{checked: rtsp?.enabled === true}}
                        onValueChange={enabled => {
                          void setFieldValue('rtsp', {
                            ...(rtsp || {port: 8554}),
                            enabled,
                          });
                          if (enabled) {
                            setExpandedSections(current => ({
                              ...current,
                              rtsp: true,
                            }));
                          }
                        }}
                      />
                    </Label>
                    {rtsp?.enabled === true && (
                      <>
                        <Label
                          text={intl.formatMessage(
                            messages['server.rtsp.port.label'],
                          )}
                          touched={Boolean(rtspErrors?.port)}
                          error={rtspErrors?.port as string}
                          required={true}
                        >
                          <Input
                            value={`${rtsp.port || ''}`}
                            accessibilityLabel={intl.formatMessage(
                              messages['server.rtsp.port.label'],
                            )}
                            testID="server-rtsp-port"
                            onBlur={handleBlur('rtsp.port')}
                            onChangeText={(value: string) =>
                              setFieldValue(
                                'rtsp.port',
                                parseFloat(value) || null,
                              )
                            }
                            keyboardType="numeric"
                          />
                        </Label>
                        {values.auth !== 'none' && (
                          <>
                            <InlineState
                              icon="warning"
                              tone="warning"
                              title={intl.formatMessage(
                                messages['server.rtsp.credentialsWarning'],
                              )}
                              testID="server-rtsp-credentials-warning"
                            />
                            <Label
                              text={intl.formatMessage(
                                messages['server.rtsp.credentialsConsent'],
                              )}
                              touched={Boolean(
                                rtspErrors?.allowInsecureCredentials,
                              )}
                              error={
                                rtspErrors?.allowInsecureCredentials as string
                              }
                            >
                              <Switch
                                testID="server-rtsp-credentials-consent"
                                value={rtsp.allowInsecureCredentials === true}
                                accessibilityRole="switch"
                                accessibilityLabel={intl.formatMessage(
                                  messages['server.rtsp.credentialsConsent'],
                                )}
                                accessibilityState={{
                                  checked:
                                    rtsp.allowInsecureCredentials === true,
                                }}
                                onValueChange={allowInsecureCredentials => {
                                  void setFieldValue(
                                    'rtsp.allowInsecureCredentials',
                                    allowInsecureCredentials,
                                  );
                                }}
                              />
                            </Label>
                          </>
                        )}
                      </>
                    )}
                  </Section>
                </>
              )}
            </ScrollView>
            <View style={styles.footer}>
              {status && <Text style={styles.formError}>{status}</Text>}
              <View style={styles.footerActions}>
                <Button
                  label={intl.formatMessage(messages['action.cancel'])}
                  size={Button.sizes.xSmall}
                  color={theme.link}
                  outlineColor={theme.link}
                  outline
                  style={styles.footerButton}
                  accessibilityLabel={intl.formatMessage(
                    messages['action.cancel'],
                  )}
                  testID="server-form-cancel"
                  disabled={isSubmitting}
                  onPress={cancel}
                />
                <Button
                  label={intl.formatMessage(
                    messages[server ? 'action.saveChanges' : 'action.add'],
                  )}
                  size={Button.sizes.xSmall}
                  color={theme.link}
                  style={styles.footerButton}
                  accessibilityLabel={intl.formatMessage(
                    messages[server ? 'action.saveChanges' : 'action.add'],
                  )}
                  testID="server-form-submit"
                  disabled={isSubmitting || saveInFlight.current}
                  onPress={() => {
                    submitRequested.current = true;
                    void formRef.current?.handleSubmit();
                    setTimeout(() => {
                      submitRequested.current = false;
                    }, 100);
                  }}
                />
              </View>
            </View>
          </View>
        );
      }}
    </Formik>
  );
};
