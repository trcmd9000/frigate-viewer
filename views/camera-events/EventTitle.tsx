import {format, formatDistance, formatRelative} from 'date-fns';
import React, {FC, useMemo} from 'react';
import {StyleProp, Text, View, ViewStyle} from 'react-native';
import {formatVideoTime, useDateLocale} from '../../helpers/locale';
import {selectLocaleDatesDisplay} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {useDesignTokens} from '../../helpers/designTokens';

interface IEventTitleProps {
  startTime: number;
  endTime: number;
  retained: boolean;
  style?: StyleProp<ViewStyle>;
  numColumns?: number;
}

export const EventTitle: FC<IEventTitleProps> = ({
  startTime,
  endTime,
  retained,
  style,
}) => {
  const dateLocale = useDateLocale();
  const datesDisplay = useAppSelector(selectLocaleDatesDisplay);

  const isInProgress = useMemo(() => !endTime, [endTime]);

  const startDate = useMemo(
    () =>
      datesDisplay === 'descriptive'
        ? formatRelative(new Date(startTime * 1000), new Date(), {
            locale: dateLocale,
          })
        : format(new Date(startTime * 1000), 'Pp', {locale: dateLocale}),
    [startTime, dateLocale, datesDisplay],
  );

  const duration = useMemo(
    () =>
      datesDisplay === 'descriptive'
        ? formatDistance(new Date(endTime * 1000), new Date(startTime * 1000), {
            includeSeconds: true,
            locale: dateLocale,
          })
        : formatVideoTime(Math.round(endTime * 1000 - startTime * 1000)),
    [startTime, endTime, dateLocale, datesDisplay],
  );

  const tokens = useDesignTokens();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: tokens.spacing.sm,
        },
        style,
      ]}
    >
      <Text
        style={{
          ...tokens.typography.timestamp,
          color: tokens.colors.textSecondary,
          flexShrink: 1,
        }}
        accessibilityLabel={`${startDate}${!isInProgress ? `, duration ${duration}` : ''}`}
      >
        {startDate} {!isInProgress && <Text>({duration})</Text>}
      </Text>
      {retained && (
        <Text
          accessible
          accessibilityLabel="Retained event"
          style={{fontSize: 18}}
        >
          ★
        </Text>
      )}
    </View>
  );
};
