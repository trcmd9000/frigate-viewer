import React, {useEffect} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {useStyles} from '../../helpers/colors';
import {messages} from './messages';
import {JavaScriptLicense} from './types';

interface LicenseDetailProps {
  license: JavaScriptLicense;
}

export const LicenseDetail: NavigationFunctionComponent<
  LicenseDetailProps
> = ({componentId, license}) => {
  const intl = useIntl();
  const styles = useStyles(({theme}) => ({
    wrapper: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 16,
      paddingBottom: 32,
    },
    metadata: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 4,
    },
    section: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 24,
      marginBottom: 8,
    },
    file: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 12,
      marginBottom: 4,
    },
    body: {
      color: theme.text,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
    },
    note: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
  }));

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {title: {text: license.name}},
    });
  }, [componentId, license.name]);

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={styles.content}>
      <Text style={styles.metadata}>
        {`${license.name} ${license.version} · ${license.license}`}
      </Text>
      {license.overrideReason ? (
        <View>
          <Text style={styles.section}>
            {intl.formatMessage(messages.reviewedOverride)}
          </Text>
          <Text style={styles.note}>{license.overrideReason}</Text>
        </View>
      ) : null}
      <Text style={styles.section}>{intl.formatMessage(messages.license)}</Text>
      {license.licenseFiles.map(document => (
        <View key={`${document.file}-${document.text.length}`}>
          <Text style={styles.file}>{document.file}</Text>
          <Text selectable style={styles.body}>
            {document.text}
          </Text>
        </View>
      ))}
      {license.noticeFiles.length > 0 ? (
        <>
          <Text style={styles.section}>
            {intl.formatMessage(messages.notices)}
          </Text>
          {license.noticeFiles.map(document => (
            <View key={`${document.file}-${document.text.length}`}>
              <Text style={styles.file}>{document.file}</Text>
              <Text selectable style={styles.body}>
                {document.text}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
};
