import {FC, useMemo} from 'react';
import {
  ImageLoadEventData,
  NativeSyntheticEvent,
  StyleSheet,
} from 'react-native';
import {ZoomableImage} from '../../components/ZoomableImage';
import {selectEventsPhotoPreference, selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {authorizationHeader, buildServerApiUrl} from '../../helpers/rest';

const styles = StyleSheet.create({
  image: {
    flex: 1,
  },
});

interface IEventSnapshotProps {
  id: string;
  hasSnapshot: boolean;
  onSnapshotLoad?: (url: string) => void;
}

export const EventSnapshot: FC<IEventSnapshotProps> = ({
  id,
  hasSnapshot,
  onSnapshotLoad,
}) => {
  const photoPreference = useAppSelector(selectEventsPhotoPreference);
  const server = useAppSelector(selectServer);
  const snapshot = useMemo(() => {
    const apiUrl = buildServerApiUrl(server);
    return hasSnapshot && photoPreference === 'snapshot'
      ? `${apiUrl}/events/${id}/snapshot.jpg?bbox=1`
      : `${apiUrl}/events/${id}/thumbnail.jpg`;
  }, [hasSnapshot, id, photoPreference, server]);

  const onLoad = (_event: NativeSyntheticEvent<ImageLoadEventData>) => {
    if (onSnapshotLoad) {
      onSnapshotLoad(snapshot);
    }
  };

  return (
    <ZoomableImage
      source={{uri: snapshot, headers: authorizationHeader(server)}}
      style={styles.image}
      fadeDuration={0}
      resizeMode="cover"
      resizeMethod="scale"
      onLoad={onLoad}
    />
  );
};
