import React from 'react';
import {StyleSheet} from 'react-native';
import {render} from '@testing-library/react-native';
import {Input} from '../../../components/forms/Input';

const mockTheme = {
  surface: '#1e1e1e',
  border: '#4b5563',
  text: '#f3f4f6',
};

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: mockTheme}),
}));

describe('Input semantic styling', () => {
  it('preserves dark surface, border, height, text color, and custom flex style', () => {
    const {getByLabelText} = render(
      <Input accessibilityLabel="Password" style={{flex: 1}} />,
    );
    const style = StyleSheet.flatten(getByLabelText('Password').props.style);

    expect(style).toEqual(
      expect.objectContaining({
        backgroundColor: '#1e1e1e',
        borderColor: '#4b5563',
        minHeight: 48,
        color: '#f3f4f6',
        flex: 1,
      }),
    );
  });
});
