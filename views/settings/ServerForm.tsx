import {Formik, FormikProps} from 'formik';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Keyboard, Platform, Pressable, Text} from 'react-native';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import * as yup from 'yup';
import {ActionBar, Switch, View} from 'react-native-ui-lib';
import {ScrollView} from 'react-native-gesture-handler';
import {Dropdown} from '../../components/forms/Dropdown';
import {Input} from '../../components/forms/Input';
import {Label} from '../../components/forms/Label';
import {Section} from '../../components/forms/Section';
import {useTheme, useStyles} from '../../helpers/colors';
import {
  CertificateListItem,
  clientCertManager,
} from '../../helpers/clientCertificates';
import {loadCredentials, saveCredentials} from '../../helpers/secureStorage';
import {SecureLogger} from '../../helpers/secureLogger';
import {handleError} from '../../helpers/errorHandler';
import {ClientCertConfig, emptyServer, Server} from '../../store/settings';
import {messages} from './messages';

interface ServerProps {
  server?: Server;
  onSubmit: (server: Server) => void;
}

export const ServerForm: NavigationFunctionComponent<ServerProps> = ({
  componentId,
  server,
  onSubmit,
}) => {
  const [certificates, setCertificates] = useState<CertificateListItem[]>([]);
  const [certificatesLoading, setCertificatesLoading] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [certPasswordLoaded, setCertPasswordLoaded] = useState(false);
  const [initialServerState, setInitialServerState] = useState<Server>(
    server ?? emptyServer(),
  );

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
    demoServerButton: {
      color: theme.link,
    },
    tip: {
      color: theme.text,
    },
    certificateButton: {
      borderColor: theme.link,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    certificateButtonText: {
      color: theme.link,
      textAlign: 'center',
    },
    selectedCertificate: {
      color: theme.text,
      marginBottom: 8,
    },
  }));
  const theme = useTheme();

  const formRef = useRef<FormikProps<Server>>(null);
  const intl = useIntl();

  const loadCertificates = useCallback(async () => {
    try {
      setCertificatesLoading(true);
      const certs = await clientCertManager.listCertificates();
      setCertificates(certs);
    } catch (error) {
      await handleError(error, 'ServerForm.loadCertificates');
      setCertificates([]);
    } finally {
      setCertificatesLoading(false);
    }
  }, []);

  const loadServerCredentials = useCallback(async () => {
    try {
      if (server) {
        const serverUrl = `${server.protocol}://${server.host}:${server.port}`;
        const credentials = await loadCredentials(serverUrl);

        if (credentials) {
          const updatedServer: Server = {
            ...server,
            credentials,
          };

          setInitialServerState(updatedServer);
        }
      }
      setCredentialsLoaded(true);
      setCertPasswordLoaded(true);
    } catch (error) {
      await handleError(error, 'ServerForm.loadServerCredentials');
      setCredentialsLoaded(true);
      setCertPasswordLoaded(true);
    }
  }, [server]);

  useEffect(() => {
    const certificatesTimeoutId =
      Platform.OS === 'ios' ? setTimeout(loadCertificates, 0) : undefined;
    const credentialsTimeoutId = setTimeout(loadServerCredentials, 0);
    return () => {
      if (certificatesTimeoutId) {
        clearTimeout(certificatesTimeoutId);
      }
      clearTimeout(credentialsTimeoutId);
    };
  }, [loadCertificates, loadServerCredentials]);

  const settingsValidationSchema = useMemo(() => {
    const requiredError = intl.formatMessage(messages['error.required']);

    return yup.object().shape({
      protocol: yup.string().required(requiredError),
      host: yup.string().required(requiredError),
      port: yup.number().nullable(),
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
      clientCertConfig: yup.object().nullable().shape({
        alias: yup.string(),
      }),
    });
  }, [intl]);

  const cancel = useCallback(() => {
    Navigation.dismissModal(componentId);
  }, [componentId]);

  const save = useCallback(
    async (modifiedServer: Server) => {
      try {
        const serverUrl = `${modifiedServer.protocol}://${modifiedServer.host}:${modifiedServer.port}`;
        if (modifiedServer.auth !== 'none' && modifiedServer.credentials) {
          await saveCredentials(serverUrl, modifiedServer.credentials);
        }

        onSubmit(modifiedServer);
        Keyboard.dismiss();
        Navigation.dismissModal(componentId);
      } catch (error) {
        SecureLogger.logError(error as Error, 'saving-server');
      }
    },
    [componentId, onSubmit],
  );

  const fillDemoServer = useCallback(() => {
    if (formRef.current) {
      formRef.current.setFieldValue('protocol', 'https');
      formRef.current.setFieldValue('host', 'demo.frigate.video');
      formRef.current.setFieldValue('port', undefined);
      formRef.current.setFieldValue('auth', 'none');
      formRef.current.setFieldValue('credentials.username', '');
      formRef.current.setFieldValue('credentials.password', '');
    }
  }, []);

  const actions = useMemo(() => {
    const cancelButton = {
      label: intl.formatMessage(messages['action.cancel']),
      color: theme.link,
      onPress: cancel,
    };
    const saveButton = {
      label: intl.formatMessage(
        messages[server ? 'action.edit' : 'action.add'],
      ),
      color: theme.link,
      onPress: () => {
        formRef.current?.handleSubmit();
      },
    };
    return [cancelButton, saveButton];
  }, [cancel, intl, server, theme]);

  return (
    <Formik
      initialValues={initialServerState}
      validationSchema={settingsValidationSchema}
      onSubmit={save}
      innerRef={formRef}
      enableReinitialize={credentialsLoaded && certPasswordLoaded}
    >
      {({values, handleBlur, handleChange, setFieldValue, errors, touched}) => {
        const clientCertTouched = (
          touched.clientCertConfig &&
          typeof touched.clientCertConfig === 'object'
            ? touched.clientCertConfig
            : undefined
        ) as {alias?: boolean} | undefined;
        const clientCertErrors = (
          errors.clientCertConfig && typeof errors.clientCertConfig === 'object'
            ? errors.clientCertConfig
            : undefined
        ) as {alias?: string} | undefined;

        return (
          <View style={styles.wrapper}>
            <ScrollView contentContainerStyle={styles.scrollArea}>
              <Text style={styles.header}>
                {intl.formatMessage(messages['server.header'])}
              </Text>
              <Section
                header={intl.formatMessage(messages['server.address.header'])}
              >
                <Label
                  text={intl.formatMessage(messages['server.protocol.label'])}
                  touched={touched.protocol}
                  error={errors.protocol}
                  required={true}
                >
                  <Dropdown
                    value={values.protocol}
                    options={[{value: 'http'}, {value: 'https'}]}
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
                    onBlur={handleBlur('path')}
                    onChangeText={handleChange('path')}
                    keyboardType="default"
                  />
                </Label>
                <Pressable onPress={fillDemoServer}>
                  <Text style={styles.demoServerButton}>
                    {intl.formatMessage(messages['server.useDemoServerButton'])}
                  </Text>
                </Pressable>
              </Section>
              <Section
                header={intl.formatMessage(messages['server.auth.header'])}
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
                      {value: 'basic', label: 'BasicAuth'},
                      {value: 'frigate', label: 'Frigate auth'},
                    ]}
                    onValueChange={handleChange('auth')}
                  />
                </Label>
                {values.auth !== 'none' && (
                  <>
                    <Label
                      text={intl.formatMessage(
                        messages['server.username.label'],
                      )}
                      touched={touched.credentials?.username}
                      error={errors.credentials?.username}
                      required={true}
                    >
                      <Input
                        value={values.credentials?.username}
                        onBlur={handleBlur('username')}
                        onChangeText={handleChange('credentials.username')}
                        keyboardType="default"
                      />
                    </Label>
                    <Label
                      text={intl.formatMessage(
                        messages['server.password.label'],
                      )}
                      touched={touched.credentials?.password}
                      error={errors.credentials?.password}
                      required={true}
                    >
                      <Input
                        value={values.credentials?.password}
                        onBlur={handleBlur('password')}
                        onChangeText={handleChange('credentials.password')}
                        keyboardType="default"
                        secureTextEntry={true}
                      />
                    </Label>
                  </>
                )}
              </Section>
              <Section header="Client Certificate (mTLS)">
                <Label
                  text="Certificate"
                  touched={clientCertTouched?.alias}
                  error={clientCertErrors?.alias}
                >
                  {Platform.OS === 'android' ? (
                    <>
                      {values.clientCertConfig?.alias && (
                        <Text style={styles.selectedCertificate}>
                          Certificate selected
                        </Text>
                      )}
                      <Pressable
                        style={styles.certificateButton}
                        onPress={async () => {
                          const alias =
                            await clientCertManager.selectCertificate(
                              values.clientCertConfig?.alias,
                            );
                          if (alias) {
                            const nextClientCertConfig: ClientCertConfig = {
                              alias,
                              allowSelfSignedServer:
                                values.clientCertConfig
                                  ?.allowSelfSignedServer ?? false,
                            };
                            setFieldValue(
                              'clientCertConfig',
                              nextClientCertConfig,
                            );
                          }
                        }}
                      >
                        <Text style={styles.certificateButtonText}>
                          {values.clientCertConfig?.alias
                            ? 'Change certificate'
                            : 'Choose certificate'}
                        </Text>
                      </Pressable>
                      {values.clientCertConfig?.alias && (
                        <Pressable
                          style={styles.certificateButton}
                          onPress={() =>
                            setFieldValue('clientCertConfig', undefined)
                          }
                        >
                          <Text style={styles.certificateButtonText}>
                            Remove certificate
                          </Text>
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <Dropdown
                      value={values.clientCertConfig?.alias || ''}
                      options={[
                        {
                          value: '',
                          label: certificatesLoading
                            ? 'Loading certificates...'
                            : certificates.length === 0
                            ? 'No certificates available'
                            : '-- Select a Certificate --',
                        },
                        ...certificates.map(
                          (cert): {value: string; label: string} => ({
                            value: cert.alias || cert.identity || '',
                            label:
                              cert.alias ||
                              cert.identity ||
                              cert.commonName ||
                              'Unknown',
                          }),
                        ),
                      ]}
                      onValueChange={value => {
                        if (typeof value === 'string' && value) {
                          const nextClientCertConfig: ClientCertConfig = {
                            alias: value,
                            allowSelfSignedServer:
                              values.clientCertConfig?.allowSelfSignedServer ??
                              false,
                          };
                          setFieldValue(
                            'clientCertConfig',
                            nextClientCertConfig,
                          );
                        } else {
                          setFieldValue('clientCertConfig', undefined);
                        }
                      }}
                    />
                  )}
                </Label>
                {values.clientCertConfig?.alias && (
                  <Label text="Allow self-signed server certificate">
                    <Switch
                      value={
                        values.clientCertConfig.allowSelfSignedServer ?? false
                      }
                      onValueChange={(allowSelfSignedServer: boolean) => {
                        setFieldValue('clientCertConfig', {
                          ...values.clientCertConfig,
                          allowSelfSignedServer,
                        });
                      }}
                    />
                  </Label>
                )}
                <Text style={styles.tip}>
                  💡 Use this if your Frigate server requires mutual TLS (mTLS)
                  authentication. The certificate must be installed on your
                  device.
                </Text>
              </Section>
            </ScrollView>
            <ActionBar
              backgroundColor={theme.background}
              keepRelative
              actions={actions}
            />
          </View>
        );
      }}
    </Formik>
  );
};
