import React from 'react';
import {render} from '@testing-library/react-native';
import {View} from 'react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import {EventLabels} from '../../../views/camera-events/EventLabels';

jest.mock('../../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    colors: {
      accent: '#145dcc',
      textOnAccent: '#fff',
      mediaBackground: '#000',
      textOnMedia: '#fff',
      surfaceElevated: '#eee',
      textSecondary: '#555',
      warningContainer: '#fff0d0',
      textOnWarning: '#111',
    },
    spacing: {xs: 4, sm: 8},
    geometry: {controlRadius: 12},
    typography: {label: {fontSize: 13, fontWeight: '600'}},
  }),
}));

describe('event metadata reflow', () => {
  it('wraps labels and zones instead of clipping at large text sizes', () => {
    const {UNSAFE_getAllByType} = render(
      <IntlProvider locale="en" messages={en}>
        <EventLabels
          endTime={20}
          label="person"
          zones={['front-yard', 'driveway', 'side-gate']}
          topScore={0.98}
        />
      </IntlProvider>,
    );

    const rootStyle = UNSAFE_getAllByType(View)[0].props.style;
    expect((Array.isArray(rootStyle) ? rootStyle[0] : rootStyle).flexWrap).toBe(
      'wrap',
    );
  });
});
