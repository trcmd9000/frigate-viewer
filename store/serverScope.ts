import type {Reducer} from '@reduxjs/toolkit';
import {serverProfileIdentity} from '../helpers/serverIdentity';
import {eventsStore, initialState as initialEventsState} from './events';
import type {IEventsState} from './events';
import {selectServer} from './settings';
import type {Server, State as SettingsState} from './settings';

export interface ServerScopeState<S extends SettingsState = SettingsState> {
  settings: S;
  events: IEventsState;
}

const effectiveServer = (state: ServerScopeState): Server =>
  // The actual selector only reads settings.v1. Its application RootState type
  // additionally requires persistence metadata, absent in plain reducer tests.
  selectServer(state as Parameters<typeof selectServer>[0]);

const sameServerScope = (before: Server, after: Server): boolean =>
  before === after ||
  (serverProfileIdentity(before) === serverProfileIdentity(after) &&
    before.credentials.username === after.credentials.username &&
    before.credentials.password === after.credentials.password);

/**
 * Coordinate settings (plain or persisted) and runtime events in one Redux
 * transition. No identity/credential snapshots, synthetic actions, or effects
 * are retained. Explicit return typing keeps RootState inference acyclic.
 */
export const createServerScopeReducer = <S extends SettingsState>(
  settingsReducer: Reducer<S>,
  eventsReducer: Reducer<IEventsState> = eventsStore.reducer,
): Reducer<ServerScopeState<S>> => {
  return (state, action) => {
    const settings = settingsReducer(state?.settings, action);
    let events = eventsReducer(state?.events, action);

    if (
      state &&
      settings !== state.settings &&
      !sameServerScope(
        effectiveServer(state),
        effectiveServer({settings, events}),
      )
    ) {
      // Reset every catalog/filter, including retained, before subscribers
      // can observe the new settings. Returning to A after B is a new epoch.
      events = {
        ...initialEventsState,
        scopeGeneration: state.events.scopeGeneration + 1,
      };
    }

    if (state && settings === state.settings && events === state.events) {
      return state;
    }
    return {settings, events};
  };
};
