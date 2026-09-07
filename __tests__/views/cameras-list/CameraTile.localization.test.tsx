import React from 'react';
import {act, render, waitFor} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import de from '../../../i18n/de';
import {CameraTile} from '../../../views/cameras-list/CameraTile';

const state = {
  server: {host: 'frigate.example', profileId: 'profile-a'},
  refreshFrequency: 10,
  actionWhenPressed: 'preview' as const,
  lockLandscape: false,
};

let mockImagePropsByUri: Record<
  string,
  {onLoad?: () => void; onError?: () => void}
> = {};

jest.mock('react-native-navigation', () => ({
  Navigation: {
    push: jest.fn(),
    showModal: jest.fn(),
  },
}));

jest.mock('../../../store/settings', () => ({
  selectServer: 'server',
  selectCamerasRefreshFrequency: 'refreshFrequency',
  selectCamerasactionWhenPressed: 'actionWhenPressed',
  selectEventsLockLandscapePlaybackOrientation: 'lockLandscape',
}));

jest.mock('../../../store/store', () => ({
  useAppSelector: (selector: keyof typeof state) => state[selector],
}));

jest.mock('../../../helpers/rest', () => ({
  buildServerApiUrl: () => 'https://frigate.example',
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
  ['IconOutline']: () => null,
}));

jest.mock('../../../components/ZoomableImage', () => ({
  ['ZoomableImage']: (props: {
    source?: {uri?: string};
    onLoad?: () => void;
    onError?: () => void;
  }) => {
    const uri = props.source?.uri || '';
    mockImagePropsByUri[uri] = props;
    return null;
  },
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

describe('CameraTile German localization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.server = {host: 'frigate.example', profileId: 'profile-a'};
    mockImagePropsByUri = {};
  });

  it('localizes the camera card and snapshot accessibility labels', () => {
    const view = render(
      <IntlProvider locale="de" messages={de}>
        <CameraTile
          cameraName="Wohnzimmer"
          componentId="CamerasStack"
          active={false}
        />
      </IntlProvider>,
    );

    expect(
      view.getByLabelText(
        'Wohnzimmer, Kamera-Standbild wird geladen. Kamera öffnen',
      ),
    ).toBeTruthy();
    expect(view.getByLabelText('Standbild der Kamera Wohnzimmer')).toBeTruthy();
    expect(view.getByText('Warten auf das erste Standbild')).toBeTruthy();
    expect(view.queryByText('camerasList.loadingSnapshot')).toBeNull();
    expect(view.queryByText('Loading camera snapshot')).toBeNull();
  });

  it('ignores an old image error after rotating to another profile', async () => {
    const media = jest.requireMock('../../../helpers/mediaDownload') as {
      downloadMedia: jest.Mock;
      fileUri: jest.Mock;
      releaseDownloadedMedia: jest.Mock;
    };
    media.downloadMedia
      .mockResolvedValueOnce('/old-snapshot.jpg')
      .mockResolvedValueOnce('/new-snapshot.jpg');
    media.fileUri.mockImplementation((path: string) => `file://${path}`);
    mockImagePropsByUri = {};

    const view = render(
      <IntlProvider locale="de" messages={de}>
        <CameraTile
          cameraName="Wohnzimmer"
          componentId="CamerasStack"
          active
        />
      </IntlProvider>,
    );

    await waitFor(() => {
      expect(mockImagePropsByUri['file:///old-snapshot.jpg']).toBeDefined();
    });

    state.server = {host: 'frigate.example', profileId: 'profile-b'};
    view.rerender(
      <IntlProvider locale="de" messages={de}>
        <CameraTile
          cameraName="Wohnzimmer"
          componentId="CamerasStack"
          active
        />
      </IntlProvider>,
    );

    await waitFor(() => {
      expect(mockImagePropsByUri['file:///new-snapshot.jpg']).toBeDefined();
    });
    act(() => {
      mockImagePropsByUri['file:///old-snapshot.jpg'].onError?.();
    });

    expect(view.queryByTestId('camera-card-media-error')).toBeNull();
    expect(media.releaseDownloadedMedia).not.toHaveBeenCalledWith(
      '/new-snapshot.jpg',
    );
  });
});
