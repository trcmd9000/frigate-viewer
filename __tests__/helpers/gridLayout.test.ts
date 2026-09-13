import {
  gridCellGutters,
  gridCellWidth,
  responsiveGridColumns,
} from '../../helpers/gridLayout';

describe('gridCellGutters', () => {
  it('removes both outer gutters for a single-column grid', () => {
    expect(gridCellGutters(0, 1, 12)).toEqual({left: 0, right: 0});
  });

  describe('responsiveGridColumns', () => {
    it('treats the preferred count as a maximum', () => {
      expect(responsiveGridColumns(432, 3, 160, 16)).toBe(2);
      expect(responsiveGridColumns(900, 3, 160, 16)).toBe(3);
    });

    it('reduces columns when text scaling needs wider cells', () => {
      expect(responsiveGridColumns(432, 2, 160, 16, 1.5)).toBe(1);
    });

    it('never returns fewer than one column', () => {
      expect(responsiveGridColumns(0, 3, 160, 16)).toBe(1);
    });

    it.each([
      [-1, 2, 160, 16, 1],
      [432, 0, 160, 16, 1],
      [432, 2, 0, 16, 1],
      [432, 2, 160, -1, 1],
      [432, 2, 160, 16, 0],
    ])(
      'rejects invalid arguments',
      (width, columns, minimumWidth, gutter, scale) => {
        expect(() =>
          responsiveGridColumns(
            width,
            columns,
            minimumWidth,
            gutter,
            scale,
          ),
        ).toThrow(RangeError);
      },
    );
  });

  it('keeps half-gutters on inner cell edges', () => {
    expect(gridCellGutters(0, 3, 12)).toEqual({left: 0, right: 6});
    expect(gridCellGutters(1, 3, 12)).toEqual({left: 6, right: 6});
    expect(gridCellGutters(2, 3, 12)).toEqual({left: 6, right: 0});
  });

  it('uses the same fixed cell width for an incomplete final row', () => {
    expect(gridCellWidth(360, 3, 12)).toBe(112);
    expect(gridCellGutters(3, 3, 12)).toEqual({left: 0, right: 6});
  });

  it('rejects invalid grid dimensions', () => {
    expect(() => gridCellGutters(0, 0, 12)).toThrow(RangeError);
    expect(() => gridCellGutters(-1, 1, 12)).toThrow(RangeError);
    expect(() => gridCellWidth(360, 2, -1)).toThrow(RangeError);
  });
});
