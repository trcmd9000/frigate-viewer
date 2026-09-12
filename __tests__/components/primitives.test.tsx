import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {AppBar, BottomDestinations, MediaSurface, StatusChip} from '../../components/primitives';

jest.mock('../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      canvas: '#fff',
      surface: '#fff',
      surfaceElevated: '#f7f9fb',
      mediaBackground: '#000',
      textPrimary: '#111',
      textSecondary: '#555',
      textOnMedia: '#fff',
      outline: '#ccc',
      divider: '#ddd',
      accent: '#145dcc',
      accentContainer: '#eef4ff',
      textOnAccent: '#fff',
      success: '#17833b',
      successContainer: '#e7f6ec',
      textOnSuccess: '#111',
      warning: '#8a5800',
      warningContainer: '#f0f4f8',
      textOnWarning: '#111',
      error: '#ba1a1a',
      errorContainer: '#fde8e7',
      textOnError: '#fff',
      scrim: '#0008',
    },
    spacing: {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32},
    geometry: {
      cardRadius: 16,
      controlRadius: 12,
      pillRadius: 999,
      minimumTouchTarget: 48,
      phoneInset: 16,
      wideInset: 24,
      mediaAspectRatio: 16 / 9,
    },
    typography: {
      screenTitle: {fontSize: 24, fontWeight: '700'},
      sectionTitle: {fontSize: 18, fontWeight: '700'},
      body: {fontSize: 16, lineHeight: 24},
      supporting: {fontSize: 14, lineHeight: 20},
      label: {fontSize: 13, fontWeight: '600'},
      timestamp: {fontSize: 12, lineHeight: 18},
      mediaOverlay: {fontSize: 14, fontWeight: '600'},
    },
  }),
}));

describe('shared media-first primitives', () => {
  it('keeps media on a near-black 16:9 surface', () => {
    const {getByTestId} = render(<MediaSurface testID="media" />);
    const style = getByTestId('media').props.style[0];

    expect(style.backgroundColor).toBe('#000');
    expect(style.aspectRatio).toBeCloseTo(16 / 9);
  });

  it('exposes app bar and status content for screen readers', () => {
    const {getByRole, getByLabelText} = render(
      <>
        <AppBar title="Cameras" />
        <StatusChip label="Connecting" accessibilityLabel="Camera connecting" />
      </>,
    );

    expect(getByRole('header')).toBeTruthy();
    expect(getByLabelText('Camera connecting')).toBeTruthy();
  });

  it('keeps destination controls selected and at least 48dp tall', () => {
    const onSelect = jest.fn();
    const {getByRole} = render(
      <BottomDestinations
        destinations={[
          {key: 'cameras', label: 'Cameras'},
          {key: 'events', label: 'Events'},
        ]}
        selectedKey="cameras"
        onSelect={onSelect}
      />,
    );
    const cameras = getByRole('tab', {name: 'Cameras'});

    expect(cameras.props.accessibilityState.selected).toBe(true);
    expect(cameras.props.style.minHeight).toBeGreaterThanOrEqual(48);
    fireEvent.press(getByRole('tab', {name: 'Events'}));
    expect(onSelect).toHaveBeenCalledWith('events');
  });
});
