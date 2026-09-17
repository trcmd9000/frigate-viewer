import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {Image, ImageStyle, Pressable, Text, View} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {messages} from './messages';
import {useOpenLink} from './useOpenLink';
import {ScrollView} from 'react-native-gesture-handler';
import {useStyles, useTheme} from '../../helpers/colors';
import {IconOutline, OutlineGlyphMapType} from '@ant-design/icons-react-native';
import packageMetadata from '../../package.json';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  createSecondaryStackDismissButton,
  handleSecondaryStackNavigationButton,
} from '../../helpers/secondaryNavigation';

interface AboutRowProps {
  icon: OutlineGlyphMapType;
  label: string;
  hint?: string;
  external?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof useAboutStyles>;
}

const useAboutStyles = () =>
  useStyles(({theme}) => ({
    wrapper: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.background,
    },
    authorInfo: {
      marginTop: 20,
      alignItems: 'center',
    },
    logo: {
      width: 80,
      height: 80,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    heading: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    version: {
      color: theme.textSecondary,
      fontSize: 14,
      marginTop: 4,
      textAlign: 'center',
    },
    body: {
      color: theme.textSecondary,
      lineHeight: 21,
      marginTop: 16,
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: theme.surfaceElevated,
    },
    rowPressed: {
      opacity: 0.72,
    },
    rowIcon: {
      width: 32,
      alignItems: 'flex-start',
    },
    rowContent: {
      flex: 1,
      paddingVertical: 8,
    },
    rowLabel: {
      color: theme.text,
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
      fontSize: 15,
      fontWeight: '700',
      marginTop: 24,
      marginBottom: 2,
    },
    upstreamLink: {
      color: theme.link,
      fontWeight: '600',
    },
  }));

const AboutRow = ({
  icon,
  label,
  hint,
  external = false,
  onPress,
  styles,
}: AboutRowProps) => {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <IconOutline
          accessible={false}
          name={icon}
          color={theme.textSecondary}
          size={20}
        />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <IconOutline
        accessible={false}
        name={external ? 'export' : 'right'}
        color={theme.textSecondary}
        size={16}
      />
    </Pressable>
  );
};

export const Author: NavigationFunctionComponent = ({componentId}) => {
  const intl = useIntl();
  const openLink = useOpenLink();

  const styles = useAboutStyles();

  useEffect(() => {
    Navigation.mergeOptions(componentId, {
      topBar: {
        title: {
          text: intl.formatMessage(messages['topBar.title']),
        },
        leftButtons: [
          createSecondaryStackDismissButton(
            intl.formatMessage(messages['topBar.back']),
          ),
        ],
      },
    });
    const subscription =
      Navigation.events().registerNavigationButtonPressedListener(event => {
        void handleSecondaryStackNavigationButton(event).catch(error => {
          SecureLogger.logError(
            error instanceof Error ? error : new Error(String(error)),
            'navigation.author-dismiss',
          );
        });
      });
    return () => subscription.remove();
  }, [componentId, intl]);

  return (
    <ScrollView style={styles.wrapper}>
      <View style={styles.authorInfo}>
        <Image
          accessible
          accessibilityLabel={intl.formatMessage(messages.identity)}
          accessibilityRole="image"
          testID="about-icon"
          source={require('./frigate-viewer-icon.png')}
          style={styles.logo as ImageStyle}
          resizeMode="contain"
        />
        <Text style={styles.heading}>
          {intl.formatMessage(messages.identity)}
        </Text>
        <Text testID="about-version" style={styles.version}>
          {intl.formatMessage(messages.version, {
            version: packageMetadata.version,
          })}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.body}>
          {intl.formatMessage(messages.disclaimer)}
        </Text>
        <Text style={styles.section}>
          {intl.formatMessage(messages.projectSection)}
        </Text>
        <AboutRow
          external
          icon="github"
          label={intl.formatMessage(messages.project)}
          hint={intl.formatMessage(messages.projectHint)}
          onPress={openLink('https://github.com/trcmd9000/frigate-viewer')}
          styles={styles}
        />
        <AboutRow
          external
          icon="history"
          label={intl.formatMessage(messages.releaseNotes)}
          hint={intl.formatMessage(messages.releaseNotesHint)}
          onPress={openLink(
            'https://github.com/trcmd9000/frigate-viewer/blob/main/CHANGELOG.md',
          )}
          styles={styles}
        />
        <Text style={styles.section}>
          {intl.formatMessage(messages.legalSection)}
        </Text>
        <AboutRow
          external
          icon="safety-certificate"
          label={intl.formatMessage(messages.privacy)}
          onPress={openLink(
            'https://trcmd9000.github.io/frigate-viewer/privacy/',
          )}
          styles={styles}
        />
        <AboutRow
          external
          icon="file-protect"
          label={intl.formatMessage(messages.appLicense)}
          hint={intl.formatMessage(messages.appLicenseHint)}
          onPress={openLink(
            'https://github.com/trcmd9000/frigate-viewer/blob/main/LICENSE',
          )}
          styles={styles}
        />
        <AboutRow
          icon="profile"
          label={intl.formatMessage(messages.thirdPartyLicenses)}
          hint={intl.formatMessage(messages.thirdPartyLicensesHint)}
          onPress={() => {
            Navigation.push(componentId, {
              component: {
                name: 'Licenses',
              },
            }).catch(error => {
              SecureLogger.logError(error, 'Author.open-licenses');
            });
          }}
          styles={styles}
        />
        <Text style={styles.section}>
          {intl.formatMessage(messages.upstream)}
        </Text>
        <Text style={styles.body}>
          {intl.formatMessage(messages.upstreamDescription)}
        </Text>
        <Text
          accessibilityRole="link"
          onPress={openLink('https://github.com/sp-engineering/frigate-viewer')}
          style={[styles.body, styles.upstreamLink]}
        >
          sp-engineering/frigate-viewer
        </Text>
      </View>
    </ScrollView>
  );
};
