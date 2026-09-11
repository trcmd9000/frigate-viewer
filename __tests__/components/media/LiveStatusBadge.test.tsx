import React from 'react';
import {render} from '@testing-library/react-native';
import {ActivityIndicator, Text, View} from 'react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import de from '../../../i18n/de';
import {LiveStatusBadge} from '../../../components/media/LiveStatusBadge';

jest.mock('@ant-design/icons-react-native', () => ({
  ['IconOutline']: () => null,
}));

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({
      theme: {
        mediaOverlay: '#000000cc',
        mediaText: '#ffffff',
      },
    }),
}));

describe('LiveStatusBadge', () => {
  it.each([
    ['snapshot', 'Snapshots'],
    ['preparing', 'Preparing live stream'],
    ['connecting', 'Connecting to live stream'],
    ['rtsp', 'RTSP live stream'],
    ['webrtc', 'WebRTC live stream'],
    ['mse', 'HEVC live stream'],
    ['live', 'Live stream'],
    ['reconnecting', 'Reconnecting to live stream'],
    ['degraded', 'Live degraded; showing snapshots'],
    ['fallback', 'Snapshot fallback'],
  ] as const)(
    'exposes the %s state as text and an accessibility label',
    (state, label) => {
      const {getByLabelText, getByText} = render(
        <IntlProvider locale="en" messages={en}>
          <LiveStatusBadge state={state} />
        </IntlProvider>,
      );

      expect(getByText(label)).toBeTruthy();
      expect(getByLabelText(label)).toBeTruthy();
    },
  );

  it('updates from connecting snapshots to the live stream label', () => {
    const {getByLabelText, rerender} = render(
      <IntlProvider locale="en" messages={en}>
        <LiveStatusBadge state="connecting" />
      </IntlProvider>,
    );

    expect(getByLabelText('Connecting to live stream')).toBeTruthy();
    rerender(
      <IntlProvider locale="en" messages={en}>
        <LiveStatusBadge state="live" />
      </IntlProvider>,
    );

    expect(getByLabelText('Live stream')).toBeTruthy();
  });

  it('shows the active codec next to a live transport label', () => {
    const {getByLabelText, getByText} = render(
      <IntlProvider locale="en" messages={en}>
        <LiveStatusBadge
          state="live"
          transport="webrtc"
          streamType="H.264"
          frameRate={15}
        />
      </IntlProvider>,
    );

    expect(getByText('WebRTC · H.264 · 15 FPS')).toBeTruthy();
    expect(getByLabelText('WebRTC live stream: H.264, 15 FPS')).toBeTruthy();
  });

  it.each([
    ['snapshot', 'Standbilder'],
    ['preparing', 'Live-Stream wird vorbereitet'],
    ['connecting', 'Verbindung zum Live-Stream wird hergestellt'],
    ['rtsp', 'RTSP-Live-Stream'],
    ['webrtc', 'WebRTC-Live-Stream'],
    ['mse', 'HEVC-Live-Stream'],
    ['live', 'Live-Stream'],
    ['reconnecting', 'Verbindung zum Live-Stream wird erneut hergestellt'],
    ['degraded', 'Live eingeschränkt; Standbilder werden angezeigt'],
    ['fallback', 'Standbild-Fallback'],
  ] as const)('renders German %s status text and accessibility', (state, label) => {
    const {getByLabelText, getByText, queryByText} = render(
      <IntlProvider locale="de" messages={de}>
        <LiveStatusBadge state={state} />
      </IntlProvider>,
    );

    expect(getByText(label)).toBeTruthy();
    expect(getByLabelText(label)).toBeTruthy();
    expect(queryByText(`cameraPreview.status.${state}`)).toBeNull();
    [
      'Snapshots',
      'Preparing live stream',
      'Connecting to live stream',
      'RTSP live stream',
      'WebRTC live stream',
      'HEVC live stream',
      'Live stream',
      'Reconnecting to live stream',
      'Live degraded; showing snapshots',
      'Snapshot fallback',
    ].forEach(englishLabel => {
      expect(queryByText(englishLabel)).toBeNull();
    });
  });

  it.each(['preparing', 'connecting', 'reconnecting'] as const)(
    'uses an animated activity indicator for %s',
    state => {
      const {UNSAFE_getByType: unsafeGetByType} = render(
        <IntlProvider locale="en" messages={en}>
          <LiveStatusBadge state={state} />
        </IntlProvider>,
      );

      expect(unsafeGetByType(ActivityIndicator).props.animating).toBe(true);
    },
  );

  it('uses intrinsic bounded width inside the shared top overlay', () => {
    const {UNSAFE_getByType: unsafeGetByType} = render(
      <IntlProvider locale="de" messages={de}>
        <LiveStatusBadge state="connecting" viewportWidth={390} />
      </IntlProvider>,
    );

    const badgeStyle = unsafeGetByType(View).props.style;
    const labelStyle = unsafeGetByType(Text).props.style;
    const labelProps = unsafeGetByType(Text).props;
    expect(badgeStyle.position).toBeUndefined();
    expect(badgeStyle.left).toBeUndefined();
    expect(badgeStyle.right).toBeUndefined();
    expect(badgeStyle.maxWidth).toBeLessThanOrEqual(390 * 0.68);
    expect(badgeStyle.alignSelf).toBe('flex-end');
    expect(badgeStyle.flexShrink).toBe(0);
    expect(badgeStyle.overflow).toBe('hidden');
    expect(labelStyle.flexShrink).toBe(1);
    expect(labelStyle.textAlign).toBe('right');
    expect(labelProps.numberOfLines).toBe(2);
  });

  it('keeps compact live telemetry on one line', () => {
    const {UNSAFE_getByType: unsafeGetByType} = render(
      <IntlProvider locale="en" messages={en}>
        <LiveStatusBadge
          state="live"
          transport="webrtc"
          streamType="H.264"
          frameRate={120}
          viewportWidth={390}
        />
      </IntlProvider>,
    );

    expect(unsafeGetByType(Text).props.numberOfLines).toBe(1);
  });

  it('uses the English fallback when a locale has no badge translations', () => {
    const {getByLabelText, getByText} = render(
      <IntlProvider locale="fr" messages={{}} onError={() => undefined}>
        <LiveStatusBadge state="reconnecting" />
      </IntlProvider>,
    );

    expect(getByText('Reconnecting to live stream')).toBeTruthy();
    expect(getByLabelText('Reconnecting to live stream')).toBeTruthy();
  });
});
