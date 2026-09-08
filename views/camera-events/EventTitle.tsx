import {format, formatRelative} from 'date-fns';
import React, {FC, useMemo} from 'react';
import {StyleProp, Text, View, ViewStyle} from 'react-native';
import {useIntl} from 'react-intl';
import {formatVideoTime, useDateLocale} from '../../helpers/locale';
import {selectLocaleDatesDisplay} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {useDesignTokens} from '../../helpers/designTokens';
import {messages} from './messages';

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
  const intl = useIntl();
  const dateLocale = useDateLocale();
  const datesDisplay = useAppSelector(selectLocaleDatesDisplay);

  const hasValidStartTime = Number.isFinite(startTime) && startTime >= 0;
  const hasValidEndTime = Number.isFinite(endTime) && endTime > 0;
  const hasDuration =
    hasValidStartTime && hasValidEndTime && endTime > startTime;
  const safeStartTime = hasValidStartTime ? startTime : 0;
  const isInProgress = !hasDuration;

  const startDate = useMemo(
    () =>
      datesDisplay === 'descriptive'
        ? formatRelative(new Date(safeStartTime * 1000), new Date(), {
            locale: dateLocale,
          })
        : format(new Date(safeStartTime * 1000), 'Pp', {locale: dateLocale}),
    [dateLocale, datesDisplay, safeStartTime],
  );

  const duration = useMemo(
    () => formatVideoTime(hasDuration ? endTime - startTime : 0),
    [endTime, hasDuration, startTime],
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
        accessibilityLabel={`${startDate}${
          !isInProgress
            ? `, ${intl.formatMessage(messages['labels.duration'], {
                duration,
              })}`
            : ''
        }`}
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
