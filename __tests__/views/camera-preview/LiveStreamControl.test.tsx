import React, {useState} from 'react';
import {BackHandler} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import {IntlProvider} from 'react-intl';
import en from '../../../i18n/en';
import {LiveStreamControl} from '../../../views/camera-preview/LiveStreamControl';

jest.mock('../../../helpers/colors', () => ({
  useTheme: () => ({
    mediaText: '#fff',
  }),
  useStyles: (factory: (value: unknown) => unknown) => factory({
    theme: {
      mediaOverlay: '#00000099',
      mediaOverlayPanel: '#000000cc',
      surfaceElevated: '#f7f9fb',
      border: '#555',
      highlighted: '#333',
      link: '#145dcc',
      text: '#1f2933',
      textInverse: '#fff',
      mediaText: '#fff',
    },
  }),
}));

const options = [
  {value: 'auto', label: 'Auto'},
  {value: 'main', label: 'Main stream'},
];

const Harness = ({onValueChange}: {onValueChange: (value: string) => void}) => {
  const [open, setOpen] = useState(false);
  return (
    <LiveStreamControl
      value="auto"
      options={options}
      open={open}
      onOpenChange={setOpen}
      onValueChange={onValueChange}
    />
  );
};

describe('LiveStreamControl', () => {
  it('opens from the gear, selects a stream, and closes first', () => {
    const onValueChange = jest.fn();
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <Harness onValueChange={onValueChange} />
      </IntlProvider>,
    );

    fireEvent.press(view.getByTestId('camera-preview-stream-dropdown'));
    fireEvent.press(view.getByRole('radio', {name: 'Main stream'}));

    expect(view.queryByRole('radio')).toBeNull();
    expect(onValueChange).toHaveBeenCalledWith('main');
  });

  it('consumes Android Back only while the menu is open', () => {
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener');
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <Harness onValueChange={jest.fn()} />
      </IntlProvider>,
    );

    fireEvent.press(view.getByTestId('camera-preview-stream-dropdown'));
    const handler = addEventListener.mock.calls.find(
      call => call[0] === 'hardwareBackPress',
    )?.[1];

    expect(handler?.()).toBe(true);
    expect(view.queryByRole('radio')).toBeNull();
    addEventListener.mockRestore();
  });

  it('uses a compact, opaque, high-contrast light-theme menu', () => {
    const view = render(
      <IntlProvider locale="en" messages={en}>
        <Harness onValueChange={jest.fn()} />
      </IntlProvider>,
    );

    fireEvent.press(view.getByTestId('camera-preview-stream-dropdown'));

    expect(view.getByTestId('camera-preview-stream-menu').props.style)
      .toMatchObject({
        width: 196,
        maxHeight: 216,
        backgroundColor: '#f7f9fb',
      });
    expect(view.getByRole('radio', {name: 'Auto'}).props.style)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({backgroundColor: '#145dcc'}),
      ]));
  });
});