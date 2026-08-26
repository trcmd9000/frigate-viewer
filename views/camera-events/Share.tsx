import {FC, useCallback, useMemo, useState} from 'react';
import {ActionSheet, Dialog} from 'react-native-ui-lib';
import {useIntl} from 'react-intl';
import RNBlobUtil from 'react-native-blob-util';
import RNShare from 'react-native-share';
import {ActivityIndicator, Text, ToastAndroid} from 'react-native';
import {ICameraEvent} from './CameraEvent';
import {messages} from './messages';
import {authorizationHeader, buildServerApiUrl} from '../../helpers/rest';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {clipFilename, snapshotFilename} from './eventHelpers';
import {useStyles} from '../../helpers/colors';
import {handleError, getUserFriendlyMessage} from '../../helpers/errorHandler';
import {SecureLogger} from '../../helpers/secureLogger';

interface ShareProps {
  event?: ICameraEvent;
  onDismiss?: () => void;
}

const stall = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

export const Share: FC<ShareProps> = ({event, onDismiss}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const intl = useIntl();
  const server = useAppSelector(selectServer);

  const styles = useStyles(() => ({
    loadingText: {
      textAlign: 'center',
      color: 'white',
    },
  }));

  const download = useCallback(
    async (filename: string, url: string): Promise<string | undefined> => {
      try {
        SecureLogger.logRequest('GET', '/events/media');
        setLoading(true);
        const dirs = RNBlobUtil.fs.dirs;
        const filePath = `${dirs.CacheDir}/${filename}`;
        const downloader = RNBlobUtil.config({
          fileCache: true,
          session: 'share',
          path: filePath,
        });
        await downloader
          .fetch('GET', url, authorizationHeader(server))
          .progress((received: number | string, total: number | string) => {
            const totalBytes = Number(total);
            const receivedBytes = Number(received);
            const nextProgress =
              totalBytes > 0
                ? Math.round((receivedBytes / totalBytes) * 100)
                : 0;
            setProgress(nextProgress);
          });
        setLoading(false);
        return filePath;
      } catch (err) {
        const appError = await handleError(err, 'Share.download');
        setLoading(false);
        ToastAndroid.show(getUserFriendlyMessage(appError), ToastAndroid.LONG);
        return undefined;
      }
    },
    [server],
  );

  const shareSnapshot = useCallback(async () => {
    if (!event) {
      return;
    }

    const apiUrl = buildServerApiUrl(server);
    const filename = snapshotFilename(event);
    const path = await download(
      filename,
      `${apiUrl}/events/${event.id}/snapshot.jpg?bbox=1`,
    );
    if (!path) {
      return;
    }
    await stall(200);
    RNShare.open({
      url: `file://${path}`,
    }).then(() => {
      RNBlobUtil.session('share').dispose();
    });
  }, [download, event, server]);

  const shareClip = useCallback(async () => {
    if (!event) {
      return;
    }

    const apiUrl = buildServerApiUrl(server);
    const filename = clipFilename(event);
    const path = await download(
      filename,
      `${apiUrl}/events/${event.id}/clip.mp4`,
    );
    if (!path) {
      return;
    }
    await stall(200);
    RNShare.open({
      url: `file://${path}`,
    }).then(() => {
      RNBlobUtil.session('share').dispose();
    });
  }, [download, event, server]);

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
      <Dialog visible={loading} ignoreBackgroundPress>
        <ActivityIndicator size="large" color="white" />
        <Text style={styles.loadingText}>{progress}%</Text>
      </Dialog>
    </>
  );
};
