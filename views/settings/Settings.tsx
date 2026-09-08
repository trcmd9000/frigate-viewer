import React, {useCallback, useMemo, useRef} from 'react';
import {Alert, Pressable, Text} from 'react-native';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {Button, Switch, View} from 'react-native-ui-lib';
import {ScrollView} from 'react-native-gesture-handler';
import {Dropdown} from '../../components/forms/Dropdown';
import {Label} from '../../components/forms/Label';
import {Card, SectionHeader} from '../../components/primitives';
import {useStyles, useTheme} from '../../helpers/colors';
import {handleError} from '../../helpers/errorHandler';
import {invalidateServerSession} from '../../helpers/rest';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  emptyServer,
  ISettings,
  saveSettings,
  selectActiveServerProfileId,
  selectServers,
  selectSettings,
  Server,
  setActiveServerProfileId,
} from '../../store/settings';
import {useAppDispatch, useAppSelector} from '../../store/store';
import {MessageKey, messages} from './messages';
import {ServerItem} from './ServerItem';
import {deleteServerProfile} from './serverProfileDeletion';

const REGION_CODES = [
  'es_AR',
  'en_AU',
  'de_AT',
  'es_BO',
  'pt_BR',
  'en_CA',
  'fr_CA',
  'es_CL',
  'es_CO',
  'es_CR',
  'es_DO',
  'es_EC',
  'fr_FR',
  'de_DE',
  'en_GB',
  'es_GT',
  'es_HN',
  'en_IE',
  'it_IT',
  'de_LU',
  'es_MX',
  'en_NZ',
  'es_NI',
  'es_PA',
  'es_PY',
  'es_PE',
  'pl_PL',
  'pt_PT',
  'es_SV',
  'es_ES',
  'sv_SE',
  'de_CH',
  'fr_CH',
  'it_CH',
  'en_US',
  'uk_UA',
  'es_UY',
  'es_VE',
] as const;

const withCurrentOption = <T extends string | number>(
  value: T,
  options: Array<{value: T; label?: string}>,
  labelForValue?: (value: T) => string,
) =>
  options.some(option => Object.is(option.value, value))
    ? options
    : [{value, label: labelForValue?.(value)}, ...options];

export const Settings: NavigationFunctionComponent = () => {
  const theme = useTheme();
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const styles = useStyles(({theme: currentTheme}) => ({
    wrapper: {
      flex: 1,
    },
    scrollArea: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      width: '100%',
      flexGrow: 1,
      backgroundColor: currentTheme.background,
    },
    card: {
      marginBottom: 12,
    },
    empty: {
      color: currentTheme.text,
      marginVertical: 8,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 4,
    },
    secondaryAction: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 12,
      marginLeft: 8,
    },
    secondaryActionText: {
      color: currentTheme.link,
      fontWeight: '600',
    },
    addButton: {
      minHeight: 48,
    },
    settingText: {
      color: currentTheme.text,
    },
  }));

  const currentSettings = useAppSelector(selectSettings) as ISettings;
  const selectedProfileId = useAppSelector(selectActiveServerProfileId);
  const selectedServers = useAppSelector(selectServers);
  const servers = useMemo(
    () =>
      Array.isArray(selectedServers)
        ? selectedServers
        : Array.isArray(currentSettings?.servers)
          ? currentSettings.servers
          : [],
    [currentSettings.servers, selectedServers],
  );
  const activeProfileId =
    typeof selectedProfileId === 'string'
      ? selectedProfileId
      : currentSettings?.activeServerProfileId;
  const serverFormNavigationInFlight = useRef(false);
  const profileDeletionInFlight = useRef(new Set<string>());

  const persist = useCallback(
    (nextSettings: ISettings, operation: string) => {
      try {
        dispatch(saveSettings(nextSettings));
      } catch (error) {
        SecureLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          operation,
        );
      }
    },
    [dispatch],
  );

  const updateSetting = useCallback(
    (update: (settings: ISettings) => ISettings) => {
      persist(update(currentSettings), 'settings.persist');
    },
    [currentSettings, persist],
  );

  const showServerForm = useCallback(
    (server: Server | undefined) => {
      if (serverFormNavigationInFlight.current) {
        return;
      }
      serverFormNavigationInFlight.current = true;
      Navigation.showModal({
        component: {
          name: 'ServerForm',
          passProps: {
            ...(server ? {server} : {}),
            onSubmit: (submittedServer: Server) => {
              const profileId = submittedServer.profileId || emptyServer().profileId;
              const normalizedServer = {...submittedServer, profileId};
              if (server) {
                invalidateServerSession(server);
              }
              const index = servers.findIndex(
                item => item.profileId === server?.profileId,
              );
              const nextServers =
                index >= 0
                  ? servers.map((item, itemIndex) =>
                      itemIndex === index ? normalizedServer : item,
                    )
                  : [...servers, normalizedServer];
              persist(
                {
                  ...currentSettings,
                  servers: nextServers,
                  activeServerProfileId:
                    currentSettings.activeServerProfileId ||
                    (nextServers.length === 1 ? profileId : activeProfileId),
                },
                'settings.persist-server',
              );
            },
          },
        },
      })
        .catch(error => {
          SecureLogger.logError(
            error instanceof Error ? error : new Error(String(error)),
            'navigation.server-form',
          );
        })
        .finally(() => {
          serverFormNavigationInFlight.current = false;
        });
    },
    [activeProfileId, currentSettings, persist, servers],
  );

  const selectProfile = useCallback(
    (profileId?: string) => {
      if (!profileId) {
        return;
      }
      try {
        dispatch(setActiveServerProfileId(profileId));
      } catch (error) {
        SecureLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          'settings.select-server',
        );
      }
    },
    [dispatch],
  );

  const deleteProfile = useCallback(
    (server: Server) => {
      const profileId = server.profileId?.trim();
      if (!profileId) {
        return;
      }
      Alert.alert(
        intl.formatMessage(messages['server.profile.delete.title']),
        intl.formatMessage(messages['server.profile.delete.message']),
        [
          {
            text: intl.formatMessage(messages['server.profile.delete.cancel']),
            style: 'cancel',
          },
          {
            text: intl.formatMessage(messages['server.profile.delete.confirm']),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                if (profileDeletionInFlight.current.has(profileId)) {
                  return;
                }
                profileDeletionInFlight.current.add(profileId);
                try {
                  // resetGenericPassword is idempotent when a profile has no
                  // credentials. Keep state until this completes so a secure
                  // storage failure cannot orphan a Keychain entry.
                  await deleteServerProfile(profileId, dispatch, server);
                } catch (error) {
                  await handleError(error, 'settings.delete-server', {
                    showToUser: true,
                  });
                  Alert.alert(
                    intl.formatMessage(messages['server.profile.delete.failure']),
                  );
                } finally {
                  profileDeletionInFlight.current.delete(profileId);
                }
              })();
            },
          },
        ],
      );
    },
    [dispatch, intl],
  );

  const tryDemo = useCallback(() => {
    const demo = emptyServer();
    const demoServer = {
      ...demo,
      host: 'demo.frigate.video',
      port: 443,
      auth: 'none' as const,
    };
    persist(
      {
        ...currentSettings,
        servers: [...servers, demoServer],
        activeServerProfileId: demoServer.profileId,
      },
      'settings.persist-demo-server',
    );
  }, [currentSettings, persist, servers]);

  const regionOptions = useMemo(
    () =>
      REGION_CODES.map(code => ({
        value: code,
        label: intl.formatMessage(
          messages[`locale.region.option.${code}` as MessageKey],
        ),
      })),
    [intl],
  );
  const refreshOptions = useMemo(
    () =>
      withCurrentOption(
        currentSettings.cameras.refreshFrequency,
        [1, 5, 10, 30, 60].map(seconds => ({
          value: seconds,
          label: `${intl.formatNumber(seconds)} ${intl.formatMessage(
            messages[
              `cameras.imageRefreshFrequency.unit.${
                seconds === 1 ? 'second' : 'seconds'
              }`
            ],
          )}`,
        })),
        value =>
          `${intl.formatNumber(value)} ${intl.formatMessage(
            messages[
              `cameras.imageRefreshFrequency.unit.${
                value === 1 ? 'second' : 'seconds'
              }`
            ],
          )}`,
      ),
    [currentSettings.cameras.refreshFrequency, intl],
  );
  const columnsOptions = useMemo(() => [{value: 1}, {value: 2}, {value: 3}], []);

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.scrollArea}>
        <SectionHeader testID="settings-page-heading">
          {intl.formatMessage(messages['topBar.title'])}
        </SectionHeader>
        <Card style={styles.card} testID="settings-server-profiles">
          <SectionHeader>
            {intl.formatMessage(messages['server.header'])}
          </SectionHeader>
          {servers.length === 0 ? (
            <>
              <Text style={styles.empty}>
                {intl.formatMessage(messages['server.profile.empty'])}
              </Text>
              <View style={styles.actions}>
                <Button
                  label={intl.formatMessage(messages['server.profile.add'])}
                  color={theme.link}
                  style={styles.addButton}
                  onPress={() => showServerForm(undefined)}
                  testID="settings-add-server"
                  accessibilityLabel={intl.formatMessage(
                    messages['server.profile.add'],
                  )}
                />
                <Pressable
                  style={styles.secondaryAction}
                  onPress={tryDemo}
                  accessibilityRole="button"
                  accessibilityLabel={intl.formatMessage(
                    messages['server.profile.tryDemo'],
                  )}
                  testID="settings-try-demo"
                >
                  <Text style={styles.secondaryActionText}>
                    {intl.formatMessage(messages['server.profile.tryDemo'])}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {servers.map(server => (
                <ServerItem
                  key={server.profileId || server.host}
                  server={server}
                  active={server.profileId === activeProfileId}
                  onSelect={() => selectProfile(server.profileId)}
                  onEdit={() => showServerForm(server)}
                  onDelete={() => deleteProfile(server)}
                />
              ))}
              <Button
                label={intl.formatMessage(messages['server.profile.add'])}
                color={theme.link}
                outline
                outlineColor={theme.link}
                style={styles.addButton}
                onPress={() => showServerForm(undefined)}
                testID="settings-add-server"
                accessibilityLabel={intl.formatMessage(
                  messages['server.profile.add'],
                )}
              />
            </>
          )}
        </Card>

        <Card style={styles.card} testID="settings-appearance">
          <SectionHeader>
            {intl.formatMessage(messages['appearance.header'])}
          </SectionHeader>
          <Label text={intl.formatMessage(messages['locale.region.label'])}>
            <Dropdown
              value={currentSettings.locale.region}
              options={regionOptions}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  locale: {...settings.locale, region: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['locale.region.label'],
              )}
            />
          </Label>
          <Label
            text={intl.formatMessage(messages['locale.datesDisplay.label'])}
          >
            <Dropdown
              value={currentSettings.locale.datesDisplay}
              options={[
                {
                  value: 'descriptive' as const,
                  label: intl.formatMessage(
                    messages['locale.datesDisplay.option.descriptive'],
                  ),
                },
                {
                  value: 'numeric' as const,
                  label: intl.formatMessage(
                    messages['locale.datesDisplay.option.numeric'],
                  ),
                },
              ]}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  locale: {...settings.locale, datesDisplay: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['locale.datesDisplay.label'],
              )}
            />
          </Label>
          <Label text={intl.formatMessage(messages['app.colorScheme.label'])}>
            <Dropdown
              value={currentSettings.app.colorScheme}
              options={[
                {
                  value: 'auto' as const,
                  label: intl.formatMessage(
                    messages['app.colorScheme.option.auto'],
                  ),
                },
                {
                  value: 'light' as const,
                  label: intl.formatMessage(
                    messages['app.colorScheme.option.light'],
                  ),
                },
                {
                  value: 'dark' as const,
                  label: intl.formatMessage(
                    messages['app.colorScheme.option.dark'],
                  ),
                },
              ]}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  app: {...settings.app, colorScheme: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['app.colorScheme.label'],
              )}
            />
          </Label>
        </Card>

        <Card style={styles.card} testID="settings-camera-overview">
          <SectionHeader>
            {intl.formatMessage(messages['cameraOverview.header'])}
          </SectionHeader>
          <Label
            text={intl.formatMessage(
              messages['cameras.imageRefreshFrequency.label'],
            )}
          >
            <Dropdown
              value={currentSettings.cameras.refreshFrequency}
              options={refreshOptions}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  cameras: {...settings.cameras, refreshFrequency: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['cameras.imageRefreshFrequency.label'],
              )}
            />
          </Label>
          <Label
            text={intl.formatMessage(messages['cameras.numberOfColumns.label'])}
          >
            <Dropdown
              value={currentSettings.cameras.numColumns}
              options={columnsOptions}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  cameras: {...settings.cameras, numColumns: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['cameras.numberOfColumns.label'],
              )}
            />
          </Label>
        </Card>

        <Card style={styles.card} testID="settings-events">
          <SectionHeader>
            {intl.formatMessage(messages['events.header'])}
          </SectionHeader>
          <Label
            text={intl.formatMessage(messages['events.numberOfColumns.label'])}
          >
            <Dropdown
              value={currentSettings.events.numColumns}
              options={columnsOptions}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  events: {...settings.events, numColumns: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['events.numberOfColumns.label'],
              )}
            />
          </Label>
          <Label
            text={intl.formatMessage(messages['events.photoPreference.label'])}
          >
            <Dropdown
              value={currentSettings.events.photoPreference}
              options={[
                {
                  value: 'snapshot' as const,
                  label: intl.formatMessage(
                    messages['events.photoPreference.option.snapshot'],
                  ),
                },
                {
                  value: 'thumbnail' as const,
                  label: intl.formatMessage(
                    messages['events.photoPreference.option.thumbnail'],
                  ),
                },
              ]}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  events: {...settings.events, photoPreference: value},
                }))
              }
              accessibilityLabel={intl.formatMessage(
                messages['events.photoPreference.label'],
              )}
            />
          </Label>
          <Label
            text={intl.formatMessage(
              messages['events.lockLandscapePlaybackOrientation.label'],
            )}
          >
            <Switch
              value={currentSettings.events.lockLandscapePlaybackOrientation}
              accessibilityRole="switch"
              accessibilityLabel={intl.formatMessage(
                messages['events.lockLandscapePlaybackOrientation.label'],
              )}
              accessibilityState={{
                checked: currentSettings.events.lockLandscapePlaybackOrientation,
              }}
              onValueChange={value =>
                updateSetting(settings => ({
                  ...settings,
                  events: {
                    ...settings.events,
                    lockLandscapePlaybackOrientation: value,
                  },
                }))
              }
            />
          </Label>
        </Card>
      </ScrollView>
    </View>
  );
};
