import React, {FC, useMemo} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import {
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
import {useDesignTokens} from '../../helpers/designTokens';
import {messages} from './messages';

interface ActiveFiltersProps {
  viewedCameraNames?: string[];
}

export const ActiveFilters: FC<ActiveFiltersProps> = ({viewedCameraNames}) => {
  const tokens = useDesignTokens();
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const cameras = useAppSelector(selectFiltersCameras);
  const labels = useAppSelector(selectFiltersLabels);
  const zones = useAppSelector(selectFiltersZones);
  const retained = useAppSelector(selectFiltersRetained);

  const active = useMemo(
    () => [
      ...(!viewedCameraNames ? cameras.map(value => ({kind: 'camera', value})) : []),
      ...labels.map(value => ({kind: 'label', value})),
      ...zones.map(value => ({kind: 'zone', value})),
      ...(retained ? [{kind: 'retained', value: intl.formatMessage(messages['miscellaneous.retained.label'])}] : []),
    ],
    [cameras, intl, labels, retained, viewedCameraNames, zones],
  );

  const clear = () => {
    dispatch(setFiltersCameras([]));
    dispatch(setFiltersLabels([]));
    dispatch(setFiltersZones([]));
    dispatch(setFiltersRetained(false));
  };

  const remove = (kind: string, value: string) => {
    if (kind === 'camera') dispatch(setFiltersCameras(cameras.filter(item => item !== value)));
    if (kind === 'label') dispatch(setFiltersLabels(labels.filter(item => item !== value)));
    if (kind === 'zone') dispatch(setFiltersZones(zones.filter(item => item !== value)));
    if (kind === 'retained') dispatch(setFiltersRetained(false));
  };

  if (active.length === 0) {
    return (
      <View
        testID="events-filter-bar"
        style={{
          minHeight: tokens.geometry.minimumTouchTarget,
          paddingHorizontal: tokens.spacing.lg,
          paddingVertical: tokens.spacing.sm,
          backgroundColor: tokens.colors.canvas,
          borderBottomWidth: 1,
          borderBottomColor: tokens.colors.divider,
        }}
      >
        <Text style={{...tokens.typography.supporting, color: tokens.colors.textSecondary}}>
          {intl.formatMessage(messages['active.none'])}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="events-filter-bar"
      accessible
      accessibilityLabel={intl.formatMessage(messages['active.count'], {count: active.length})}
      style={{
        minHeight: tokens.geometry.minimumTouchTarget,
        paddingHorizontal: tokens.spacing.lg,
        paddingVertical: tokens.spacing.sm,
        backgroundColor: tokens.colors.canvas,
        borderBottomWidth: 1,
        borderBottomColor: tokens.colors.divider,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{alignItems: 'center', gap: tokens.spacing.sm}}
      >
        {active.map(item => (
          <Pressable
            key={`${item.kind}-${item.value}`}
            onPress={() => remove(item.kind, item.value)}
            accessibilityRole="button"
            accessibilityLabel={intl.formatMessage(messages['active.remove'], {value: item.value})}
            accessibilityHint={intl.formatMessage(messages['active.removeHint'])}
            style={{
              minHeight: tokens.geometry.minimumTouchTarget,
              maxWidth: 220,
              paddingHorizontal: tokens.spacing.md,
              borderRadius: tokens.geometry.pillRadius,
              backgroundColor: tokens.colors.accentContainer,
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{...tokens.typography.label, color: tokens.colors.textPrimary}}
            >
              {item.value} ×
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={clear}
          accessibilityRole="button"
          accessibilityLabel={intl.formatMessage(messages['active.clear'])}
          style={{
            minHeight: tokens.geometry.minimumTouchTarget,
            paddingHorizontal: tokens.spacing.md,
            justifyContent: 'center',
          }}
        >
          <Text style={{...tokens.typography.label, color: tokens.colors.accent}}>
            {intl.formatMessage(messages['active.clear'])}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};
