import React, {useMemo} from 'react';
import {ActionCreatorWithPayload} from '@reduxjs/toolkit';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {useIntl} from 'react-intl';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {
  selectAvailableCameras,
  selectAvailableLabels,
  selectAvailableZones,
  selectFiltersCameras,
  selectFiltersLabels,
  selectFiltersRetained,
  selectFiltersZones,
  setFiltersCameras,
  setFiltersLabels,
  setFiltersRetained,
  setFiltersZones,
} from '../../store/events';
import {useAppDispatch, useAppSelector} from '../../store/store';
import {Filters, IFilter, SectionHeader} from './Filters';
import {messages} from './messages';
import {Section} from '../../components/forms/Section';
import {FilterSwitch} from './FilterSwitch';
import {useStyles} from '../../helpers/colors';
import {useDesignTokens} from '../../helpers/designTokens';
import {
  ServerScopeScreenProps,
  useServerScopeOwner,
  withServerScopeScreen,
} from '../../helpers/serverScopeScreen';

interface IEventsFiltersProps extends ServerScopeScreenProps {
  viewedCameraNames?: string[];
}

const EventsFiltersContent: NavigationFunctionComponent<IEventsFiltersProps> = ({
  viewedCameraNames,
  ownerScopeGeneration,
}) => {
  const {isCurrentScope} = useServerScopeOwner(ownerScopeGeneration);
  const styles = useStyles(({theme}) => ({
    wrapper: {
      backgroundColor: theme.background,
      width: '100%',
      height: '100%',
    },
  }));

  const availableCameras = useAppSelector(selectAvailableCameras);
  const filtersCameras = useAppSelector(selectFiltersCameras);
  const availableLabels = useAppSelector(selectAvailableLabels);
  const filtersLabels = useAppSelector(selectFiltersLabels);
  const availableZones = useAppSelector(selectAvailableZones);
  const filtersZones = useAppSelector(selectFiltersZones);
  const filtersRetained = useAppSelector(selectFiltersRetained);
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const tokens = useDesignTokens();
  const activeCount =
    filtersCameras.length +
    filtersLabels.length +
    filtersZones.length +
    (filtersRetained ? 1 : 0);

  const clearFilters = () => {
    if (!isCurrentScope()) {
      return;
    }
    dispatch(setFiltersCameras([]));
    dispatch(setFiltersLabels([]));
    dispatch(setFiltersZones([]));
    dispatch(setFiltersRetained(false));
  };

  // Child controls dispatch action creators themselves. Keep their typed API,
  // but make retained callbacks inert against the live store after a switch.
  const scopedAction = <T,>(action: ActionCreatorWithPayload<T>) =>
    Object.assign(
      (payload: T) => {
        const result = action(payload);
        return isCurrentScope()
          ? result
          : {...result, type: 'events/ignoredStaleFilter'};
      },
      action,
    );

  const cameras: IFilter[] = useMemo(
    () =>
      availableCameras.map(cameraName => ({
        name: cameraName,
        selected: (viewedCameraNames
          ? viewedCameraNames
          : filtersCameras
        ).includes(cameraName),
      })),
    [availableCameras, filtersCameras, viewedCameraNames],
  );

  const labels: IFilter[] = useMemo(
    () =>
      availableLabels.map(cameraName => ({
        name: cameraName,
        selected: filtersLabels.includes(cameraName),
      })),
    [availableLabels, filtersLabels],
  );

  const zones: IFilter[] = useMemo(
    () =>
      availableZones.map(cameraName => ({
        name: cameraName,
        selected: filtersZones.includes(cameraName),
      })),
    [availableZones, filtersZones],
  );

  return (
    <ScrollView
      style={[styles.wrapper]}
      contentContainerStyle={{
        padding: tokens.spacing.lg,
        paddingBottom: tokens.spacing.xxl,
      }}
      accessibilityLabel={intl.formatMessage(messages['screen.label'])}
    >
      <View
        style={{
          minHeight: tokens.geometry.minimumTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: tokens.spacing.md,
        }}
      >
        <Text style={{...tokens.typography.sectionTitle, color: tokens.colors.textPrimary}}>
          {intl.formatMessage(messages['screen.title'])}
        </Text>
        {activeCount > 0 && (
          <Pressable
            onPress={clearFilters}
            accessibilityRole="button"
            accessibilityLabel={intl.formatMessage(messages['active.clear'])}
            style={{minHeight: tokens.geometry.minimumTouchTarget, justifyContent: 'center'}}
          >
            <Text style={{...tokens.typography.label, color: tokens.colors.accent}}>
              {intl.formatMessage(messages['active.clear'])}
            </Text>
          </Pressable>
        )}
      </View>
      <Filters
        header={intl.formatMessage(messages['cameras.title'])}
        items={cameras}
        disabled={viewedCameraNames !== undefined}
        actionOnFilter={scopedAction(setFiltersCameras)}
      />
      <Filters
        header={intl.formatMessage(messages['labels.title'])}
        items={labels}
        actionOnFilter={scopedAction(setFiltersLabels)}
      />
      <Filters
        header={intl.formatMessage(messages['zones.title'])}
        items={zones}
        actionOnFilter={scopedAction(setFiltersZones)}
      />
      <Section
        header={
          <SectionHeader
            label={intl.formatMessage(messages['miscellaneous.title'])}
          />
        }
      >
        <FilterSwitch
          label={intl.formatMessage(messages['miscellaneous.retained.label'])}
          value={filtersRetained}
          actionOnChange={scopedAction(setFiltersRetained)}
        />
      </Section>
    </ScrollView>
  );
};

export const EventsFilters = withServerScopeScreen(EventsFiltersContent);
