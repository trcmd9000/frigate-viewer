import React, {useEffect} from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {Text, Pressable} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {Provider} from 'react-redux';
import {store} from '../../store/store';
import {setFiltersLabels} from '../../store/events';
import {
  dismissModalWhenServerScopeChanges,
  withServerScopeScreen,
} from '../../helpers/serverScopeScreen';
import {SecureLogger} from '../../helpers/secureLogger';
import {CameraPreview} from '../../views/camera-preview/CameraPreview';
import {EventsFilters} from '../../views/events-filters/EventsFilters';
import {filterButton} from '../../views/events-filters/eventsFiltersHelpers';

const mockCleanup = jest.fn();
const mockContentRender = jest.fn();
const mockListenerRemove = jest.fn();
let mockModalDismissed: (event: {componentId: string}) => void;

jest.mock('../../store/store', () => {
  const {configureStore} = require('@reduxjs/toolkit');
  const {eventsStore} = require('../../store/events');
  const redux = require('react-redux');
  return {
    store: configureStore({
      reducer: {
        events: (state: ReturnType<typeof eventsStore.reducer>, action: {type: string}) => {
          const next = eventsStore.reducer(state, action);
          return action.type === 'test/advanceScope'
            ? {...next, scopeGeneration: next.scopeGeneration + 1}
            : next;
        },
      },
    }),
    useAppSelector: redux.useSelector,
    useAppDispatch: redux.useDispatch,
  };
});
jest.mock('react-native-navigation', () => ({
  Navigation: {
    dismissModal: jest.fn(() => Promise.resolve()),
    dismissOverlay: jest.fn(() => Promise.resolve()),
    showModal: jest.fn(() => Promise.resolve('filters-modal')),
    events: () => ({
      registerModalDismissedListener: (callback: typeof mockModalDismissed) => {
        mockModalDismissed = callback;
        return {remove: mockListenerRemove};
      },
    }),
  },
}));
jest.mock('../../helpers/secureLogger', () => ({
  SecureLogger: {logError: jest.fn()},
}));
jest.mock('../../helpers/colors', () => ({
  useStyles: () => ({}),
}));
jest.mock('../../helpers/designTokens', () => ({
  useDesignTokens: () => ({
    spacing: {}, geometry: {}, typography: {}, colors: {},
  }),
}));
jest.mock('react-intl', () => ({
  useIntl: () => ({formatMessage: ({id}: {id: string}) => id}),
  defineMessages: (messages: unknown) => messages,
}));
jest.mock('../../views/camera-preview/LivePreview', () => ({
  LivePreview: () => {
    const ReactModule = require('react');
    mockContentRender();
    ReactModule.useEffect(() => () => mockCleanup(), []);
    return ReactModule.createElement(require('react-native').Text, null, 'live-media');
  },
}));
jest.mock('../../components/forms/Section', () => ({
  Section: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../../views/events-filters/FilterSwitch', () => ({
  FilterSwitch: () => null,
}));
jest.mock('../../views/events-filters/Filters', () => ({
  SectionHeader: () => null,
  Filters: (props: {header: string; actionOnFilter: (names: string[]) => {type: string}}) => {
    const ReactModule = require('react');
    const dispatch = require('react-redux').useDispatch();
    return ReactModule.createElement(require('react-native').Pressable, {
      testID: props.header,
      onPress: () => dispatch(props.actionOnFilter(['old-label'])),
    });
  },
}));

const advance = () => store.dispatch({type: 'test/advanceScope'});
const generation = () => store.getState().events.scopeGeneration;
const wrap = (children: React.ReactNode) => <Provider store={store}>{children}</Provider>;

describe('server scope screen barrier', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves content state and static options within the captured scope', () => {
    const Content: NavigationFunctionComponent<{ownerScopeGeneration?: number}> = () => {
      useEffect(() => () => mockCleanup(), []);
      const [count, setCount] = React.useState(0);
      return <Pressable onPress={() => setCount(count + 1)}><Text>{count}</Text></Pressable>;
    };
    Content.options = {topBar: {visible: false}};
    const Screen = withServerScopeScreen(Content);
    expect(Screen.options).toBe(Content.options);
    const props = {componentId: 'detail', componentName: 'Detail'};
    const view = render(wrap(<Screen {...props} />));
    fireEvent.press(view.getByText('0'));
    view.rerender(wrap(<Screen {...props} ownerScopeGeneration={generation() + 1} />));
    expect(view.getByText('1')).toBeTruthy();
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    view.unmount();
  });

  it('removes preview media and title on the first switch render and dismisses only its modal', () => {
    const view = render(wrap(<CameraPreview cameraName="old-camera" componentId="preview" componentName="CameraPreview" />));
    expect(view.getByText('old-camera')).toBeTruthy();
    const renders = mockContentRender.mock.calls.length;
    act(() => { advance(); });
    expect(view.toJSON()).toBeNull();
    expect(mockContentRender).toHaveBeenCalledTimes(renders);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith('preview');
    act(() => { advance(); });
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
  });

  it('rejects a delayed old mount before content executes and handles overlay dismissal rejection', async () => {
    const Content = jest.fn(() => <Text>stale</Text>);
    const Screen = withServerScopeScreen(Content, 'overlay');
    (Navigation.dismissOverlay as jest.Mock).mockRejectedValueOnce(new Error('native failure'));
    const view = render(wrap(<Screen ownerScopeGeneration={generation() - 1} componentId="old-overlay" componentName="Overlay" />));
    expect(view.toJSON()).toBeNull();
    expect(Content).not.toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); });
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith('old-overlay');
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(SecureLogger.logError).toHaveBeenCalledTimes(1);
  });

  it('handles a synchronous native modal dismissal failure', async () => {
    (Navigation.dismissModal as jest.Mock).mockImplementationOnce(() => { throw new Error('native failure'); });
    render(wrap(<CameraPreview cameraName="old" componentId="old-modal" componentName="CameraPreview" ownerScopeGeneration={generation() - 1} />));
    await act(async () => { await Promise.resolve(); });
    expect(SecureLogger.logError).toHaveBeenCalledTimes(1);
  });

  it('unmounts filters and makes previously retained filter callbacks inert', () => {
    store.dispatch(setFiltersLabels(['new-label']));
    const view = render(wrap(<EventsFilters componentId="filters" componentName="EventsFilters" />));
    const press = view.UNSAFE_getAllByType(Pressable).find(
      button => button.props.testID === 'eventsFilters.labels.title',
    )!.props.onPress;
    act(() => { advance(); });
    expect(view.toJSON()).toBeNull();
    act(() => { press(); });
    expect(store.getState().events.filters.labels).toEqual(['new-label']);
    expect(Navigation.dismissModal).toHaveBeenCalledWith('filters');
  });

  it('captures toolbar ownership and rejects queued and old filter launches', async () => {
    const button = filterButton(2);
    const press = (button.component!.passProps as {onPress: () => void}).onPress;
    await act(async () => press());
    expect(Navigation.showModal).toHaveBeenCalledWith({component: {
      name: 'EventsFilters', passProps: {ownerScopeGeneration: generation()},
    }});
    jest.clearAllMocks();
    await act(async () => { press(); advance(); });
    expect(Navigation.showModal).not.toHaveBeenCalled();
    await act(async () => press());
    expect(Navigation.showModal).not.toHaveBeenCalled();
  });

  it('bounds a list-modal watcher to its own dismissal or a single scope switch', () => {
    dismissModalWhenServerScopeChanges('retained', generation());
    mockModalDismissed({componentId: 'unrelated'});
    expect(mockListenerRemove).not.toHaveBeenCalled();
    advance();
    expect(Navigation.dismissModal).toHaveBeenCalledWith('retained');
    expect(mockListenerRemove).toHaveBeenCalledTimes(1);
    advance();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    dismissModalWhenServerScopeChanges('closed', generation());
    mockModalDismissed({componentId: 'closed'});
    advance();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
  });
});
