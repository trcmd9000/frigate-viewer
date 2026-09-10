import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import de from '../../../i18n/de';
import {LiveAudioControl} from '../../../views/camera-preview/LiveAudioControl';

jest.mock('@ant-design/icons-react-native', () => ({
  ['IconOutline']: (props: Record<string, unknown>) => {
    const ReactModule = require('react');
    const NativeView = require('react-native').View;
    return ReactModule.createElement(NativeView, {
      testID: 'camera-preview-audio-icon',
      ...props,
    });
  },
}));

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({
      theme: {
        mediaOverlay: '#000000cc',
        mediaText: '#ffffff',
      },
    }),
  useTheme: () => ({
    mediaOverlay: '#000000cc',
    mediaText: '#ffffff',
  }),
}));

const ToggleHarness = () => {
  const [muted, setMuted] = React.useState(true);
  return <LiveAudioControl muted={muted} onToggle={() => setMuted(!muted)} />;
};

describe('LiveAudioControl', () => {
  it.each([
    {locale: 'en', messages: en, label: 'Cancel audio activation', hint: 'Activating audio… Tap to cancel.'},
    {locale: 'de', messages: de, label: 'Audioaktivierung abbrechen', hint: 'Audio wird aktiviert… Zum Abbrechen tippen.'},
    {locale: 'fr', messages: {}, label: 'Cancel audio activation', hint: 'Activating audio… Tap to cancel.'},
  ])('localizes cancellable pending feedback for $locale', ({locale, messages, label, hint}) => {
    const onToggle = jest.fn();
    const view = render(
      <IntlProvider locale={locale} messages={messages} onError={() => undefined}>
        <LiveAudioControl muted disabled status={{state: 'pending'}} onToggle={onToggle} />
      </IntlProvider>,
    );
    const button = view.getByRole('button', {name: label});
    expect(button.props.accessibilityState).toEqual({checked: false, busy: true});
    expect(button.props.accessibilityHint).toBe(hint);
    expect(view.getByText(hint)).toBeTruthy();
    fireEvent.press(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it.each(['focus-denied', 'native', 'timeout'] as const)('provides a retry and fallback hint for %s', reason => {
    const view = render(
      <IntlProvider locale="fr" messages={{}} onError={() => undefined}>
        <LiveAudioControl muted status={{state: 'failed', reason}} onToggle={jest.fn()} />
      </IntlProvider>,
    );
    const button = view.getByRole('button', {name: 'Retry audio'});
    expect(button.props.accessibilityState).toEqual({checked: false});
    expect(button.props.accessibilityHint).toBe(en[`cameraPreview.audio.failure.${reason}`]);
  });

  it('uses the speaker icon with a slash only while muted', () => {
    const {getByRole, getByTestId, queryByText} = render(
      <IntlProvider locale="de" messages={de}>
        <LiveAudioControl muted onToggle={jest.fn()} />
      </IntlProvider>,
    );
    const button = getByRole('button', {name: 'Audio einschalten'});

    expect(button.props.accessibilityState).toEqual({checked: false});
    expect(getByTestId('camera-preview-audio-icon').props.name).toBe('sound');
    expect(getByTestId('camera-preview-audio-slash')).toBeTruthy();
    expect(queryByText('Ton an')).toBeNull();
    expect(queryByText('Ton aus')).toBeNull();
    expect(queryByText('Audio einschalten')).toBeNull();
  });

  it('uses the unslashed speaker icon when audible and toggles through its callback', () => {
    const onToggle = jest.fn();
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LiveAudioControl muted={false} onToggle={onToggle} />
      </IntlProvider>,
    );
    const button = view.getByRole('button', {name: 'Disable audio'});

    expect(button.props.accessibilityState).toEqual({checked: true});
    expect(view.getByTestId('camera-preview-audio-icon').props.name).toBe(
      'sound',
    );
    expect(view.queryByTestId('camera-preview-audio-slash')).toBeNull();
    expect(view.queryByText('Sound on')).toBeNull();
    expect(view.queryByText('Sound off')).toBeNull();

    fireEvent.press(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('updates its full label and checked state when toggled', () => {
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <ToggleHarness />
      </IntlProvider>,
    );
    const mutedButton = view.getByRole('button', {name: 'Enable audio'});

    expect(mutedButton.props.accessibilityState).toEqual({checked: false});
    fireEvent.press(mutedButton);

    const audibleButton = view.getByRole('button', {name: 'Disable audio'});
    expect(audibleButton.props.accessibilityState).toEqual({checked: true});
    expect(view.queryByTestId('camera-preview-audio-slash')).toBeNull();
  });

  it('uses English accessibility fallbacks for unsupported locales', () => {
    const view = render(
      <IntlProvider locale="fr" messages={{}} onError={() => undefined}>
        <ToggleHarness />
      </IntlProvider>,
    );
    const mutedButton = view.getByRole('button', {name: 'Enable audio'});

    expect(mutedButton.props.accessibilityLabel).toBe('Enable audio');
    expect(mutedButton.props.accessibilityLabel).not.toContain(
      'cameraPreview.audio',
    );
    fireEvent.press(mutedButton);

    const audibleButton = view.getByRole('button', {name: 'Disable audio'});
    expect(audibleButton.props.accessibilityLabel).toBe('Disable audio');
    expect(audibleButton.props.accessibilityLabel).not.toContain(
      'cameraPreview.audio',
    );
  });

  it('communicates unavailable audio without presenting an active toggle', () => {
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <LiveAudioControl
          muted
          disabled
          onToggle={jest.fn()}
        />
      </IntlProvider>,
    );
    const button = view.getByRole('button', {name: 'Audio unavailable'});

    expect(button.props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    });
    fireEvent.press(button);
    expect(button.props.onPress).toBeUndefined();
  });

  it('keeps a compact centered pill above the gesture area', () => {
    const {getByTestId} = render(
      <IntlProvider locale="en" messages={en}>
        <LiveAudioControl muted onToggle={jest.fn()} />
      </IntlProvider>,
    );
    const containerStyle = getByTestId('camera-preview-audio-container').props
      .style;
    const buttonStyle = getByTestId('camera-preview-audio').props.style;

    expect(containerStyle).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: 'center',
    });
    expect(buttonStyle).toMatchObject({
      width: 48,
      height: 48,
      minWidth: 48,
      minHeight: 48,
      borderRadius: 24,
      backgroundColor: '#000000cc',
    });
  });
});
