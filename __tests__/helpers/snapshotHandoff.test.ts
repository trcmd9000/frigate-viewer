import {
  commitSnapshotHandoff,
  discardSnapshotHandoff,
  queueSnapshotHandoff,
} from '../../helpers/snapshotHandoff';

const first = {
  handoffId: 1,
  path: '/cache/first.jpg',
  src: 'file:///cache/first.jpg',
};
const second = {
  handoffId: 2,
  path: '/cache/second.jpg',
  src: 'file:///cache/second.jpg',
};

describe('snapshot handoff', () => {
  it('keeps the displayed image while a replacement is pending', () => {
    const state = queueSnapshotHandoff({displayed: first}, second);

    expect(state).toEqual({displayed: first, pending: second});
    expect(commitSnapshotHandoff(state, 2)).toEqual({displayed: second});
  });

  it('ignores stale completion and failure callbacks', () => {
    const state = queueSnapshotHandoff({displayed: first}, second);

    expect(commitSnapshotHandoff(state, 1)).toBe(state);
    expect(discardSnapshotHandoff(state, 1)).toBe(state);
  });
});
