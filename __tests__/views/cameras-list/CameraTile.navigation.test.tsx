import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {Navigation} from 'react-native-navigation';
import {Platform, Pressable} from 'react-native';
import {CameraTile} from '../../../views/cameras-list/CameraTile';

const state = {
  scopeGeneration: 0,
  server: {host: 'frigate.example'},
  refreshFrequency: 10,
  actionWhenPressed: 'preview' as 'events' | 'preview',
  lockLandscape: false,
};

jest.mock('react-native-navigation', () => ({
  Navigation: {
    push: jest.fn(),
    showModal: jest.fn(),
  },
}));

jest.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({id}: {id: string}) =>
      ({
        'camerasList.snapshot': 'Snapshot',
        'camerasList.open': 'Open camera',
        'camerasList.waiting': 'Waiting',
      }[id] || id),
  }),
  defineMessages: (messages: unknown) => messages,
}));

jest.mock('../../../store/settings', () => ({
  selectServer: 'server',
  selectCamerasRefreshFrequency: 'refreshFrequency',
  selectCamerasactionWhenPressed: 'actionWhenPressed',
  selectEventsLockLandscapePlaybackOrientation: 'lockLandscape',
}));

jest.mock('../../../store/store', () => ({
  store: {getState: () => ({events: {scopeGeneration: state.scopeGeneration}})},
  useAppSelector: (selector: keyof typeof state) => state[selector],
}));

jest.mock('../../../helpers/rest', () => ({
  buildServerApiUrl: () => 'https://frigate.example',
  useRest: () => ({get: jest.fn()}),
}));

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      surface: '#fff',
      outline: '#ddd',
      mediaBackground: '#000',
      surfaceElevated: '#222',
      textSecondary: '#555',
    },
    geometry: {
      cardRadius: 16,
      minimumTouchTarget: 48,
      mediaAspectRatio: 16 / 9,
    },
    spacing: {sm: 8, md: 12, lg: 16},
    typography: {mediaOverlay: {fontSize: 14, fontWeight: '600'}},
  }),
}));

jest.mock('@ant-design/icons-react-native', () => ({
  IconOutline: () => null,
}));

jest.mock('../../../components/ZoomableImage', () => ({
  ZoomableImage: () => null,
}));

jest.mock('../../../helpers/mediaDownload', () => ({
  downloadMedia: jest.fn(),
  fileUri: jest.fn(),
  releaseDownloadedMedia: jest.fn(),
  removeDownloadedMedia: jest.fn(),
  retainDownloadedMedia: jest.fn(),
}));

jest.mock('../../../helpers/secureLogger', () => ({
  SecureLogger: {logError: jest.fn()},
}));

describe('CameraTile native navigation', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as {OS: string}).OS = 'android';
    state.scopeGeneration = 0;
    state.actionWhenPressed = 'preview';
    state.lockLandscape = false;
    (Navigation.showModal as jest.Mock).mockReturnValue(
      new Promise<void>(() => undefined),
    );
  });

  afterEach(() => {
    (Platform as {OS: string}).OS = originalPlatform;
  });

  it('navigates from the card container and ignores duplicate presses in flight', async () => {
    const {getByTestId} = render(
      <CameraTile
        cameraName="lumus_pro"
        componentId="CamerasStack"
        active={false}
      />,
    );
    const card = getByTestId('camera-card-lumus_pro');
    const nameScrim = getByTestId('camera-card-name-lumus_pro');

    expect(card.props.style[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({padding: 0, borderWidth: 0}),
      ]),
    );
    expect(nameScrim.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({paddingHorizontal: 12, paddingVertical: 8}),
      ]),
    );
    expect(nameScrim.props.children.props.numberOfLines).toBe(1);

    await act(async () => {
      fireEvent.press(card);
      fireEvent.press(card);
    });

    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    expect(Navigation.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        component: expect.objectContaining({
          name: 'CameraPreview',
          passProps: expect.objectContaining({
            cameraName: 'lumus_pro',
            ownerScopeGeneration: 0,
            startupStartedAt: expect.any(Number),
            startupTraceId: expect.any(Number),
          }),
          options: expect.objectContaining({
            layout: expect.objectContaining({
              backgroundColor: '#000000',
              fitSystemWindows: true,
            }),
            topBar: {visible: false},
            statusBar: expect.objectContaining({
              visible: true,
              drawBehind: false,
            }),
            navigationBar: {visible: false, backgroundColor: '#000000'},
          }),
        }),
      }),
    );
  });

  it('always opens the live preview regardless of retired camera preferences', async () => {
    state.actionWhenPressed = 'events';
    const {getByTestId} = render(
      <CameraTile
        cameraName="lumus_pro"
        componentId="CamerasStack"
        active={false}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('camera-card-lumus_pro'));
    });

    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    expect(Navigation.push).not.toHaveBeenCalled();
  });

  it('keeps the landscape lock immersive during the portrait-to-landscape request', async () => {
    state.lockLandscape = true;
    const {getByTestId} = render(
      <CameraTile cameraName="locked-camera" active={false} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('camera-card-locked-camera'));
    });

    expect(Navigation.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        component: expect.objectContaining({
          options: expect.objectContaining({
            layout: expect.objectContaining({
              orientation: ['sensorLandscape'],
              fitSystemWindows: true,
            }),
            statusBar: expect.objectContaining({
              visible: true,
              drawBehind: false,
            }),
            navigationBar: {visible: false, backgroundColor: '#000000'},
          }),
        }),
      }),
    );
  });

  it('rejects old presses and queued navigation using the live generation', async () => {
    const view = render(<CameraTile cameraName="same-name" active={false} />);
    const press = view.UNSAFE_getAllByType(Pressable).find(
      button => button.props.testID === 'camera-card-same-name',
    )!.props.onPress;
    await act(async () => {
      press();
      state.scopeGeneration += 1;
    });
    expect(Navigation.showModal).not.toHaveBeenCalled();
    await act(async () => press());
    expect(Navigation.showModal).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => press());
    expect(Navigation.showModal).not.toHaveBeenCalled();
  });
});
