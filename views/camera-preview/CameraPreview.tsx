import React from 'react';
import {View} from 'react-native';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {useStyles} from '../../helpers/colors';
import {usePortraitMediaTopInset} from '../../helpers/mediaSafeArea';
import {
  ServerScopeScreenProps,
  withServerScopeScreen,
} from '../../helpers/serverScopeScreen';
import {LivePreview} from './LivePreview';

interface CameraPreviewProps extends ServerScopeScreenProps {
  cameraName: string;
  startupStartedAt?: number;
  startupTraceId?: number;
}

const CameraPreviewContent: NavigationFunctionComponent<CameraPreviewProps> = ({
  cameraName,
  startupStartedAt,
  startupTraceId,
}) => {
  const portraitTopInset = usePortraitMediaTopInset();
  const styles = useStyles(({theme}) => ({
    wrapper: {
      flex: 1,
      backgroundColor: theme.mediaBackground,
    },
  }));

  return (
    <View
      testID="camera-preview-screen"
      style={[styles.wrapper, {paddingTop: portraitTopInset}]}
    >
      <LivePreview
        cameraName={cameraName}
        startupStartedAt={startupStartedAt}
        startupTraceId={startupTraceId}
      />
    </View>
  );
};

export const CameraPreview = withServerScopeScreen(CameraPreviewContent);
