export interface GridCellGutters {
  left: number;
  right: number;
}

const validateGridArguments = (
  index: number,
  numColumns: number,
  gutter: number,
): void => {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('Grid item index must be a non-negative integer');
  }
  if (!Number.isInteger(numColumns) || numColumns < 1) {
    throw new RangeError('Grid column count must be a positive integer');
  }
  if (!Number.isFinite(gutter) || gutter < 0) {
    throw new RangeError('Grid gutter must be a non-negative number');
  }
};

export const gridCellGutters = (
  index: number,
  numColumns: number,
  gutter: number,
): GridCellGutters => {
  validateGridArguments(index, numColumns, gutter);
  const column = index % numColumns;
  const halfGutter = gutter / 2;

  return {
    left: column === 0 ? 0 : halfGutter,
    right: column === numColumns - 1 ? 0 : halfGutter,
  };
};

export const gridCellWidth = (
  containerWidth: number,
  numColumns: number,
  gutter: number,
): number => {
  if (!Number.isFinite(containerWidth) || containerWidth < 0) {
    throw new RangeError('Grid container width must be a non-negative number');
  }
  validateGridArguments(0, numColumns, gutter);
  return (containerWidth - gutter * (numColumns - 1)) / numColumns;
};

export const responsiveGridColumns = (
  containerWidth: number,
  preferredColumns: number,
  minimumCellWidth: number,
  gutter: number,
  fontScale = 1,
): number => {
  if (!Number.isFinite(containerWidth) || containerWidth < 0) {
    throw new RangeError('Grid container width must be a non-negative number');
  }
  if (!Number.isFinite(minimumCellWidth) || minimumCellWidth <= 0) {
    throw new RangeError('Grid minimum cell width must be a positive number');
  }
  if (!Number.isFinite(fontScale) || fontScale <= 0) {
    throw new RangeError('Grid font scale must be a positive number');
  }
  validateGridArguments(0, preferredColumns, gutter);

  const scaledMinimumWidth =
    minimumCellWidth * Math.min(Math.max(fontScale, 1), 1.5);
  const availableColumns = Math.max(
    1,
    Math.floor((containerWidth + gutter) / (scaledMinimumWidth + gutter)),
  );
  return Math.min(preferredColumns, availableColumns);
};
