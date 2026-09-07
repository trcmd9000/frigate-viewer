import {useFormsStyles} from '../../../components/forms/styles';

let mockTheme = {
  surface: '#ffffff',
  border: '#cbd2d9',
};

jest.mock('../../../helpers/colors', () => ({
  useStyles: (fn: (value: unknown) => unknown) =>
    fn({theme: mockTheme}),
}));

describe('form input surfaces', () => {
  it.each([
    ['light', '#ffffff', '#cbd2d9'],
    ['dark', '#1e1e1e', '#4b5563'],
  ])('uses semantic %s surface and border tokens', (_mode, surface, border) => {
    mockTheme = {surface, border};
    const styles = useFormsStyles();

    expect(styles.input).toEqual(
      expect.objectContaining({
        backgroundColor: surface,
        borderColor: border,
        borderWidth: 1,
      }),
    );
  });
});
