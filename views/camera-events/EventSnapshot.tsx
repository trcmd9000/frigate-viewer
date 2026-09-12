import {FC, useEffect, useMemo, useState} from 'react';
import {
  ImageLoadEventData,
  NativeSyntheticEvent,
  StyleSheet,
} from 'react-native';
import {ZoomableImage} from '../../components/ZoomableImage';
import {selectEventsPhotoPreference, selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {buildServerApiUrl} from '../../helpers/rest';
import {
  downloadMedia,
  fileUri,
  removeDownloadedMedia,
  releaseDownloadedMedia,
  retainDownloadedMedia,
} from '../../helpers/mediaDownload';
import {SecureLogger} from '../../helpers/secureLogger';
import {Text, View} from 'react-native';
import {useDesignTokens} from '../../helpers/designTokens';

const styles = StyleSheet.create({
  image: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface IEventSnapshotProps {
  id: string;
  hasSnapshot: boolean;
  enabled: boolean;
  onSnapshotLoad?: (url: string) => void;
}

export const EventSnapshot: FC<IEventSnapshotProps> = ({
  id,
  hasSnapshot,
  enabled,
  onSnapshotLoad,
}) => {
  const photoPreference = useAppSelector(selectEventsPhotoPreference);
  const tokens = useDesignTokens();
  const server = useAppSelector(selectServer);
  const snapshot = useMemo(() => {
    const apiUrl = buildServerApiUrl(server);
    return hasSnapshot && photoPreference === 'snapshot'
      ? `${apiUrl}/events/${id}/snapshot.jpg?bbox=1`
      : `${apiUrl}/events/${id}/thumbnail.jpg`;
  }, [hasSnapshot, id, photoPreference, server]);
  const [snapshotUri, setSnapshotUri] = useState<string>();

  useEffect(() => {
    let active = true;
    let downloadedPath: string | undefined;
    setSnapshotUri(undefined);
    if (!enabled) {
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        const path = await downloadMedia(server, snapshot);
        downloadedPath = path;
        if (active) {
          retainDownloadedMedia(path);
          setSnapshotUri(fileUri(path));
        } else {
          await removeDownloadedMedia(path);
        }
      } catch (error) {
        SecureLogger.logError(error as Error, 'loading-event-snapshot');
      }
    })();

    return () => {
      active = false;
      void releaseDownloadedMedia(downloadedPath);
    };
  }, [enabled, server, snapshot]);

  const onLoad = (_event: NativeSyntheticEvent<ImageLoadEventData>) => {
    if (onSnapshotLoad && snapshotUri) {
      onSnapshotLoad(snapshotUri);
    }
  };

  return snapshotUri ? (
    <ZoomableImage
      source={{uri: snapshotUri}}
      style={styles.image}
      fadeDuration={0}
      resizeMode="cover"
      resizeMethod="scale"
      onLoad={onLoad}
      accessibilityLabel="Event thumbnail"
    />
  ) : (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading event thumbnail"
      style={[styles.placeholder, {backgroundColor: tokens.colors.mediaBackground}]}
    >
      <Text style={{color: tokens.colors.textOnMedia, opacity: 0.75}}>
        {enabled ? 'Loading thumbnail' : 'Thumbnail unavailable'}
      </Text>
    </View>
  );
};
