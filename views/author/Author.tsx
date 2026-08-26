import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {Image, ImageStyle, Text, View} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {menuButton, useMenu} from '../menu/menuHelpers';
import {messages} from './messages';
import {UsedLibs} from './UsedLibs';
import {useOpenLink} from './useOpenLink';
import {ScrollView} from 'react-native-gesture-handler';
import {palette, useStyles} from '../../helpers/colors';

export const Author: NavigationFunctionComponent = ({componentId}) => {
  useMenu(componentId, 'author');
  const intl = useIntl();
  const openLink = useOpenLink();

  const styles = useStyles(({theme}) => ({
    wrapper: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.background,
    },
    authorInfo: {
      marginTop: 20,
      flexDirection: 'column',
      alignItems: 'center',
    },
    logoWrapper: {
      backgroundColor: palette.white,
      borderRadius: 10,
    },
    logo: {
      width: 100,
      height: 100,
      marginHorizontal: 12,
      resizeMode: 'contain',
    },
    link: {
      color: theme.link,
    },
    item: {
      marginVertical: 10,
      marginHorizontal: 20,
    },
    itemLabel: {
      fontWeight: '500',
      color: theme.text,
    },
    itemValue: {
      color: theme.text,
      textAlign: 'center',
    },
    repository: {
      flexDirection: 'column',
    },
  }));

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {
        title: {
          text: intl.formatMessage(messages['topBar.title']),
        },
        leftButtons: [menuButton],
      },
    });
  }, [componentId, intl]);

  return (
    <ScrollView style={styles.wrapper}>
      <View style={styles.authorInfo}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('./sp-engineering-logo.png')}
            style={styles.logo as ImageStyle}
          />
        </View>
        <Text style={styles.item}>
          <Text style={styles.itemLabel}>
            {intl.formatMessage(messages['info.authorLabel'])}:{' '}
          </Text>
          <Text style={styles.itemValue}>trcmd9000</Text>
        </Text>
        <Text style={styles.item}>
          <Text style={styles.itemLabel}>
            {intl.formatMessage(messages['info.contactLabel'])}:{' '}
          </Text>
          <Text
            style={[styles.itemValue, styles.link]}
            onPress={openLink('mailto:trcmd9000@gmail.com')}
          >
            trcmd9000@gmail.com
          </Text>
        </Text>
        <Text
          style={[styles.item, styles.itemValue, styles.link]}
          onPress={openLink(
            'https://trcmd9000.github.io/frigate-viewer/privacy/',
          )}
        >
          {intl.formatMessage(messages['info.privacyPolicyLabel'])}
        </Text>
        <Text style={styles.item}>
          <Text style={styles.itemLabel}>Repository: </Text>
          <Text
            style={[styles.itemValue, styles.link]}
            onPress={openLink('https://github.com/trcmd9000/frigate-viewer')}
          >
            github.com/trcmd9000/frigate-viewer
          </Text>
        </Text>
        <View style={[styles.item, styles.repository]}>
          <Text style={styles.itemValue}>
            {intl.formatMessage(messages['info.opensourceLabel'])}
          </Text>
          <Text
            style={[styles.itemValue, styles.link]}
            onPress={openLink(
              'https://github.com/sp-engineering/frigate-viewer',
            )}
          >
            Based on the original open-source project by SP engineering
          </Text>
        </View>
      </View>
      <UsedLibs />
    </ScrollView>
  );
};
