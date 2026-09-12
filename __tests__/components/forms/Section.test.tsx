import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {Text} from 'react-native';
import {Section} from '../../../components/forms/Section';

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    background: '#fff',
    surface: '#fff',
    surfaceElevated: '#f7f9fb',
    text: '#000',
    textSecondary: '#555',
    textInverse: '#fff',
    link: '#06c',
    border: '#ccc',
    divider: '#ddd',
    highlighted: '#eee',
    mediaBackground: '#000',
    mediaText: '#fff',
    error: '#b00',
    warning: '#850',
    success: '#080',
    successSurface: '#efe',
    dangerSurface: '#fee',
    overlay: '#0008',
  }),
}));

describe('Section', () => {
  it('supports accessible expansion and collapsed summaries', () => {
    const {getByTestId, getByText, queryByText} = render(
      <Section
        header="External connection"
        summary="Address and route"
        testID="progressive-section"
        expanded={false}
        onToggle={jest.fn()}
      >
        <>{'Host field'}</>
      </Section>,
    );

    expect(getByText('Address and route')).toBeTruthy();
    expect(queryByText('Host field')).toBeNull();
    expect(getByTestId('progressive-section').props.accessibilityState).toEqual(
      {
        expanded: false,
      },
    );

    fireEvent.press(getByText('External connection'));
  });

  it('supports an always-expanded non-interactive presentation', () => {
    const onToggle = jest.fn();
    const {getByTestId, getByText, queryByText} = render(
      <Section
        header="Server settings"
        summary="Configured"
        testID="always-expanded-section"
        expanded={false}
        onToggle={onToggle}
        alwaysExpanded
      >
        <Text>All controls</Text>
      </Section>,
    );

    expect(getByText('All controls')).toBeTruthy();
    expect(getByTestId('always-expanded-section').props.accessibilityState).toBe(
      undefined,
    );
    expect(queryByText('+')).toBeNull();
    expect(queryByText('−')).toBeNull();
    fireEvent.press(getByText('Server settings'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
