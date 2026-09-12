import {createSlice, PayloadAction} from '@reduxjs/toolkit';

/**
 * STORE MODEL
 **/

export interface IEventsState {
  /** Runtime-only epoch for data belonging to the effective active server. */
  scopeGeneration: number;
  available: {
    cameras: string[];
    labels: string[];
    zones: string[];
  };
  filters: {
    cameras: string[];
    labels: string[];
    zones: string[];
    retained: boolean;
  };
}

export const initialState: IEventsState = {
  scopeGeneration: 0,
  available: {
    cameras: [],
    labels: [],
    zones: [],
  },
  filters: {
    cameras: [],
    labels: [],
    zones: [],
    retained: false,
  },
};

/**
 * REDUCERS
 **/

export const eventsStore = createSlice({
  name: 'events',
  initialState,
  reducers: {
    setAvailableForScope: (
      state,
      action: PayloadAction<{
        generation: number;
        available: IEventsState['available'];
      }>,
    ) => {
      if (action.payload.generation !== state.scopeGeneration) {
        return;
      }
      state.available = action.payload.available;
    },
    setAvailableCameras: (state, action: PayloadAction<string[]>) => {
      state.available.cameras = action.payload;
    },
    setAvailableLabels: (state, action: PayloadAction<string[]>) => {
      state.available.labels = action.payload;
    },
    setAvailableZones: (state, action: PayloadAction<string[]>) => {
      state.available.zones = action.payload;
    },
    setFiltersCameras: (state, action: PayloadAction<string[]>) => {
      state.filters.cameras = action.payload;
    },
    setFiltersLabels: (state, action: PayloadAction<string[]>) => {
      state.filters.labels = action.payload;
    },
    setFiltersZones: (state, action: PayloadAction<string[]>) => {
      state.filters.zones = action.payload;
    },
    setFiltersRetained: (state, action: PayloadAction<boolean>) => {
      state.filters.retained = action.payload;
    },
  },
});

/**
 * ACTIONS
 **/

export const {
  setAvailableForScope,
  setAvailableCameras,
  setAvailableLabels,
  setAvailableZones,
  setFiltersCameras,
  setFiltersLabels,
  setFiltersZones,
  setFiltersRetained,
} = eventsStore.actions;

/**
 * SELECTORS
 **/

interface EventsRootState {
  events: IEventsState;
}

const eventsState = (state: EventsRootState) => state.events;

export const selectServerScopeGeneration = (state: EventsRootState): number =>
  eventsState(state).scopeGeneration;

/* available */

export const selectAvailable = (state: EventsRootState) =>
  eventsState(state).available;

export const selectAvailableCameras = (state: EventsRootState) =>
  selectAvailable(state).cameras;

export const selectAvailableLabels = (state: EventsRootState) =>
  selectAvailable(state).labels;

export const selectAvailableZones = (state: EventsRootState) =>
  selectAvailable(state).zones;

/* filters */

export const selectFilters = (state: EventsRootState) =>
  eventsState(state).filters;

export const selectFiltersCameras = (state: EventsRootState) =>
  selectFilters(state).cameras;

export const selectFiltersLabels = (state: EventsRootState) =>
  selectFilters(state).labels;

export const selectFiltersZones = (state: EventsRootState) =>
  selectFilters(state).zones;

export const selectFiltersRetained = (state: EventsRootState) =>
  selectFilters(state).retained;
