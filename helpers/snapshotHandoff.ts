export interface SnapshotImage {
  handoffId: number;
  path: string;
  src: string;
}

export interface SnapshotHandoffState {
  displayed?: SnapshotImage;
  pending?: SnapshotImage;
}

export const queueSnapshotHandoff = (
  state: SnapshotHandoffState,
  pending: SnapshotImage,
): SnapshotHandoffState => ({
  displayed: state.displayed,
  pending,
});

export const commitSnapshotHandoff = (
  state: SnapshotHandoffState,
  handoffId: number,
): SnapshotHandoffState => {
  if (!state.pending || state.pending.handoffId !== handoffId) {
    return state;
  }
  return {displayed: state.pending};
};

export const discardSnapshotHandoff = (
  state: SnapshotHandoffState,
  handoffId: number,
): SnapshotHandoffState =>
  state.pending?.handoffId === handoffId ? {displayed: state.displayed} : state;
