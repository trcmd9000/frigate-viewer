import {gridCellGutters, gridCellWidth} from '../../helpers/gridLayout';

describe('gridCellGutters', () => {
  it('removes both outer gutters for a single-column grid', () => {
    expect(gridCellGutters(0, 1, 12)).toEqual({left: 0, right: 0});
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
