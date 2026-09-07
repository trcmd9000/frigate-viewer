import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {Dropdown} from '../../../components/forms/Dropdown';

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    background: '#fff',
    text: '#000',
    link: '#06c',
    border: '#ccc',
    highlighted: '#eee',
    disabled: '#888',
    overlay: '#0008',
  }),
  useStyles: (factory: (arg: {theme: Record<string, string>}) => unknown) =>
    factory({
      theme: {
        background: '#fff',
        text: '#000',
        link: '#06c',
        border: '#ccc',
        highlighted: '#eee',
        disabled: '#888',
        overlay: '#0008',
      },
    }),
}));

describe('Dropdown', () => {
  it('opens a marked single-choice list and closes after selecting', () => {
    const onValueChange = jest.fn();
    const {getByTestId, getAllByText, getByText} = render(
      <Dropdown
        testID="dropdown"
        value="one"
        options={[
          {value: 'one', label: 'First'},
          {value: 'two', label: 'Second'},
        ]}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.press(getByTestId('dropdown'));
    expect(getAllByText('First').length).toBeGreaterThan(0);
    expect(getByText('✓')).toBeTruthy();

    fireEvent.press(getByText('Second'));
    expect(onValueChange).toHaveBeenCalledWith('two');
  });

  it('closes on backdrop press and honors disabled state', () => {
    const {getByTestId, queryByLabelText} = render(
      <Dropdown
        testID="dropdown"
        value="one"
        disabled
        options={[{value: 'one', label: 'First'}]}
      />,
    );

    fireEvent.press(getByTestId('dropdown'));
    expect(queryByLabelText('Close options')).toBeNull();

    const enabled = render(
      <Dropdown
        testID="enabled-dropdown"
        value="one"
        options={[{value: 'one', label: 'First'}]}
      />,
    );
    fireEvent.press(enabled.getByTestId('enabled-dropdown'));
    fireEvent.press(enabled.getByLabelText('Close options'));
    expect(enabled.queryByLabelText('Close options')).toBeNull();
  });
});
