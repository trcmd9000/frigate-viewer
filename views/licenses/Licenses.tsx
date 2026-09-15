import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {IconOutline} from '@ant-design/icons-react-native';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {useStyles, useTheme} from '../../helpers/colors';
import {openAndroidOssLicenses} from '../../helpers/ossLicenses';
import {SecureLogger} from '../../helpers/secureLogger';
import catalogJson from '../../licenses/js-licenses.json';
import nativeCatalogJson from '../../licenses/android-license-overrides.json';
import {messages} from './messages';
import {
  JavaScriptLicense,
  JavaScriptLicenseCatalog,
} from './types';

const catalog = catalogJson as JavaScriptLicenseCatalog;
const nativeCatalog = nativeCatalogJson as JavaScriptLicenseCatalog;

export const Licenses: NavigationFunctionComponent = ({componentId}) => {
  const intl = useIntl();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const styles = useStyles(({theme: currentTheme}) => ({
    wrapper: {
      flex: 1,
      backgroundColor: currentTheme.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    search: {
      minHeight: 48,
      marginTop: 12,
      paddingHorizontal: 12,
      borderRadius: 8,
      color: currentTheme.text,
      backgroundColor: currentTheme.surfaceElevated,
    },
    section: {
      color: currentTheme.text,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 20,
      marginBottom: 4,
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      marginTop: 8,
      borderRadius: 8,
      backgroundColor: currentTheme.surfaceElevated,
    },
    rowPressed: {
      opacity: 0.72,
    },
    rowContent: {
      flex: 1,
      paddingVertical: 8,
    },
    rowLabel: {
      color: currentTheme.text,
      fontSize: 15,
      fontWeight: '600',
    },
    rowHint: {
      color: currentTheme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    icon: {
      width: 32,
    },
    empty: {
      color: currentTheme.textSecondary,
      textAlign: 'center',
      marginTop: 24,
    },
  }));

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {
        title: {text: intl.formatMessage(messages['topBar.title'])},
        leftButtons: [
          {
            id: 'closeLicenses',
            text: intl.formatMessage(messages.close),
          },
        ],
      },
    });
    const subscription =
      Navigation.events().registerNavigationButtonPressedListener(event => {
        if (
          event.componentId === componentId &&
          event.buttonId === 'closeLicenses'
        ) {
          Navigation.dismissModal(componentId).catch(error => {
            SecureLogger.logError(error, 'Licenses.close');
          });
        }
      });
    return () => subscription.remove();
  }, [componentId, intl]);

  const filteredLicenses = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return catalog.packages;
    }
    return catalog.packages.filter(item =>
      `${item.name} ${item.version} ${item.license}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query]);

  const openLicense = useCallback(
    (license: JavaScriptLicense) => {
      Navigation.push(componentId, {
        component: {
          name: 'LicenseDetail',
          passProps: {license},
        },
      }).catch(error => {
        SecureLogger.logError(error, 'Licenses.open-detail');
      });
    },
    [componentId],
  );

  const openAndroidLicenses = useCallback(() => {
    const title = intl.formatMessage(messages.android);
    openAndroidOssLicenses(title).catch(error => {
      SecureLogger.logError(error, 'Licenses.open-android');
      Alert.alert(intl.formatMessage(messages.error));
    });
  }, [intl]);

  const renderLicense = useCallback(
    ({item}: {item: JavaScriptLicense}) => (
      <Pressable
        accessibilityRole="button"
        onPress={() => openLicense(item)}
        style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>{item.name}</Text>
          <Text style={styles.rowHint}>
            {`${item.version} · ${item.license}`}
          </Text>
        </View>
        <IconOutline
          accessible={false}
          name="right"
          color={theme.textSecondary}
          size={16}
        />
      </Pressable>
    ),
    [openLicense, styles, theme.textSecondary],
  );

  return (
    <View style={styles.wrapper}>
      <FlatList
        data={filteredLicenses}
        keyExtractor={item => `${item.name}@${item.version}`}
        renderItem={renderLicense}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <TextInput
              accessibilityLabel={intl.formatMessage(messages.search)}
              placeholder={intl.formatMessage(messages.search)}
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              style={styles.search}
            />
            {Platform.OS === 'android' ? (
              <>
                <Text style={styles.section}>
                  {intl.formatMessage(messages.nativeNotices)}
                </Text>
                {nativeCatalog.packages.map(item => (
                  <React.Fragment key={`${item.name}@${item.version}`}>
                    {renderLicense({item})}
                  </React.Fragment>
                ))}
                <Pressable
                  accessibilityLabel={intl.formatMessage(messages.android)}
                  accessibilityRole="button"
                  onPress={openAndroidLicenses}
                  style={({pressed}) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.icon}>
                    <IconOutline
                      accessible={false}
                      name="android"
                      color={theme.textSecondary}
                      size={20}
                    />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>
                      {intl.formatMessage(messages.android)}
                    </Text>
                    <Text style={styles.rowHint}>
                      {intl.formatMessage(messages.androidHint)}
                    </Text>
                  </View>
                  <IconOutline
                    accessible={false}
                    name="export"
                    color={theme.textSecondary}
                    size={16}
                  />
                </Pressable>
              </>
            ) : null}
            <Text style={styles.section}>
              {intl.formatMessage(messages.javascript)}
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{intl.formatMessage(messages.empty)}</Text>
        }
      />
    </View>
  );
};
