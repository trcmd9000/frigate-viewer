import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {Image, ImageStyle, Pressable, Text, View} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {menuButton, useMenu} from '../menu/menuHelpers';
import {messages} from './messages';
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
    content: {
      padding: 20,
    },
    heading: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    body: {
      color: theme.text,
      lineHeight: 21,
      marginTop: 16,
    },
    row: {
      minHeight: 48,
      justifyContent: 'center',
      marginTop: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: theme.surfaceElevated,
    },
    rowLabel: {
      color: theme.link,
      fontSize: 16,
      fontWeight: '600',
    },
    rowHint: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    section: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 24,
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
            source={require('./frigate-viewer-icon.png')}
            style={styles.logo as ImageStyle}
          />
        </View>
        <Text style={styles.heading}>
          {intl.formatMessage(messages.identity)}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.body}>{intl.formatMessage(messages.disclaimer)}</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={intl.formatMessage(messages.contact)}
          onPress={openLink('mailto:trcmd9000@gmail.com')}
          style={styles.row}
        >
          <Text style={styles.rowLabel}>{intl.formatMessage(messages.maintainer)}</Text>
          <Text style={styles.rowHint}>trcmd9000@gmail.com</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={intl.formatMessage(messages.privacy)}
          onPress={openLink(
            'https://trcmd9000.github.io/frigate-viewer/privacy/',
          )}
          style={styles.row}
        >
          <Text style={styles.rowLabel}>{intl.formatMessage(messages.privacy)}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={intl.formatMessage(messages.source)}
          onPress={openLink('https://github.com/trcmd9000/frigate-viewer')}
          style={styles.row}
        >
          <Text style={styles.rowLabel}>{intl.formatMessage(messages.source)}</Text>
          <Text style={styles.rowHint}>
            github.com/trcmd9000/frigate-viewer · GPL-3.0
          </Text>
        </Pressable>
        <Text style={styles.section}>{intl.formatMessage(messages.upstream)}</Text>
        <Text style={styles.body}>
          {intl.formatMessage(messages.upstreamDescription)}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="sp-engineering/frigate-viewer"
          onPress={openLink('https://github.com/sp-engineering/frigate-viewer')}
          style={styles.row}
        >
          <Text style={styles.rowLabel}>sp-engineering/frigate-viewer</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};
