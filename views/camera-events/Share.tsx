import {FC, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActionSheet, Dialog} from 'react-native-ui-lib';
import {useIntl} from 'react-intl';
import RNShare from 'react-native-share';
import {ActivityIndicator, Text, ToastAndroid} from 'react-native';
import {ICameraEvent} from './CameraEvent';
import {messages} from './messages';
import {buildServerApiUrl} from '../../helpers/rest';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {clipFilename, snapshotFilename} from './eventHelpers';
import {useStyles, useTheme} from '../../helpers/colors';
import {handleError, getUserFriendlyMessage} from '../../helpers/errorHandler';
import {SecureLogger} from '../../helpers/secureLogger';
import {
  downloadMedia,
  fileUri,
  removeDownloadedMedia,
  releaseDownloadedMedia,
  retainDownloadedMedia,
} from '../../helpers/mediaDownload';

interface ShareProps {
  event?: ICameraEvent;
  onDismiss?: () => void;
}

const stall = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

export const Share: FC<ShareProps> = ({event, onDismiss}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const mounted = useRef(true);
  const intl = useIntl();
  const server = useAppSelector(selectServer);
  const theme = useTheme();

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const styles = useStyles(({theme: palette}) => ({
    loadingText: {
      textAlign: 'center',
      color: palette.text,
    },
  }));

  const download = useCallback(
    async (url: string): Promise<string | undefined> => {
      try {
        SecureLogger.logRequest('GET', '/events/media');
        if (mounted.current) {
          setProgress(0);
          setLoading(true);
        }
        const filePath = await downloadMedia(server, url);
        if (!mounted.current) {
          await removeDownloadedMedia(filePath);
          return undefined;
        }
        if (mounted.current) {
          setProgress(100);
          setLoading(false);
        }
        return filePath;
      } catch (err) {
        const appError = await handleError(err, 'Share.download');
        if (mounted.current) {
          setLoading(false);
          ToastAndroid.show(
            getUserFriendlyMessage(appError),
            ToastAndroid.LONG,
          );
        }
        return undefined;
      }
    },
    [server],
  );

  const shareFile = useCallback(
    async (path: string, filename: string, type: string) => {
      try {
        await stall(200);
        if (!mounted.current) {
          return;
        }
        await RNShare.open({
          url: fileUri(path),
          filename,
          type,
        });
      } catch (error) {
        const appError = await handleError(error, 'Share.open');
        if (mounted.current) {
          ToastAndroid.show(
            getUserFriendlyMessage(appError),
            ToastAndroid.LONG,
          );
        }
      } finally {
        await releaseDownloadedMedia(path, 'share');
      }
    },
    [],
  );

  const shareSnapshot = useCallback(async () => {
    if (!event) {
      return;
    }

    const apiUrl = buildServerApiUrl(server);
    const filename = snapshotFilename(event);
    const path = await download(
      `${apiUrl}/events/${event.id}/snapshot.jpg?bbox=1`,
    );
    if (!path) {
      return;
    }
    retainDownloadedMedia(path, 'share');
    await shareFile(path, filename, 'image/jpeg');
  }, [download, event, server, shareFile]);

  const shareClip = useCallback(async () => {
    if (!event) {
      return;
    }

    const apiUrl = buildServerApiUrl(server);
    const filename = clipFilename(event);
    const path = await download(`${apiUrl}/events/${event.id}/clip.mp4`);
    if (!path) {
      return;
    }
    retainDownloadedMedia(path, 'share');
    await shareFile(path, filename, 'video/mp4');
  }, [download, event, server, shareFile]);

  const options = useMemo(
    () => [
      ...(event?.has_snapshot
        ? [
            {
              label: intl.formatMessage(messages['share.snapshot.label']),
              onPress: shareSnapshot,
            },
          ]
        : []),
      ...(event?.has_clip
        ? [
            {
              label: intl.formatMessage(messages['share.clip.label']),
              onPress: shareClip,
            },
          ]
        : []),
    ],
    [event, intl, shareClip, shareSnapshot],
  );

  const close = () => {
    onDismiss?.();
  };

  return (
    <>
      <ActionSheet
        title={intl.formatMessage(messages['action.share'])}
        visible={Boolean(event)}
        options={options}
        onDismiss={close}
      />
      <Dialog
        visible={loading}
        ignoreBackgroundPress
        containerStyle={{backgroundColor: theme.surface}}
      >
        <ActivityIndicator size="large" color={theme.link} />
        <Text style={styles.loadingText}>{progress}%</Text>
      </Dialog>
    </>
  );
};
