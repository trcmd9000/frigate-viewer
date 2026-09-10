import React from 'react';
import {Text, View} from 'react-native';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {useStyles} from '../../helpers/colors';
import {
  ServerScopeScreenProps,
  withServerScopeScreen,
} from '../../helpers/serverScopeScreen';
import {LivePreview} from './LivePreview';

interface CameraPreviewProps extends ServerScopeScreenProps {
  cameraName: string;
}

const CameraPreviewContent: NavigationFunctionComponent<CameraPreviewProps> = ({
  cameraName,
}) => {
  const styles = useStyles(({theme}) => ({
    wrapper: {
      flex: 1,
      backgroundColor: theme.mediaBackground,
    },
    title: {
      position: 'absolute',
      top: 12,
      left: 16,
      right: '52%',
      zIndex: 4,
      paddingRight: 8,
      color: theme.mediaText,
      fontSize: 18,
      fontWeight: '700',
    },
  }));

  return (
    <View testID="camera-preview-screen" style={styles.wrapper}>
      <LivePreview cameraName={cameraName} />
      <Text
        testID="camera-preview-title"
        accessibilityRole="header"
        accessibilityLabel={cameraName}
        numberOfLines={2}
        ellipsizeMode="tail"
        style={styles.title}
      >
        {cameraName}
      </Text>
    </View>
  );
};

export const CameraPreview = withServerScopeScreen(CameraPreviewContent);
