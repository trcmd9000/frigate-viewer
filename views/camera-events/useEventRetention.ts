import {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {handleError} from '../../helpers/errorHandler';
import {useRest} from '../../helpers/rest';
import {selectServer} from '../../store/settings';
import {useAppSelector} from '../../store/store';
import {messages} from './messages';

interface UseEventRetentionOptions {
  eventId: string;
  initiallyRetained: boolean;
  onRetainedChange?: (retained: boolean) => void;
}

export const useEventRetention = ({
  eventId,
  initiallyRetained,
  onRetainedChange,
}: UseEventRetentionOptions) => {
  const intl = useIntl();
  const server = useAppSelector(selectServer);
  const {del, post} = useRest();
  const [retained, setRetained] = useState(initiallyRetained);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);

  useEffect(() => {
    if (!updatingRef.current) {
      setRetained(initiallyRetained);
    }
  }, [initiallyRetained]);

  const toggleRetained = useCallback(() => {
    if (updatingRef.current) {
      return;
    }

    const nextRetained = !retained;
    updatingRef.current = true;
    setUpdating(true);
    const request = nextRetained
      ? post(server, `events/${eventId}/retain`, {json: false})
      : del(server, `events/${eventId}/retain`, {json: false});

    void request
      .then(() => {
        setRetained(nextRetained);
        onRetainedChange?.(nextRetained);
      })
      .catch(error => handleError(error, 'CameraEvent.retention'))
      .finally(() => {
        updatingRef.current = false;
        setUpdating(false);
      });
  }, [del, eventId, onRetainedChange, post, retained, server]);

  return {
    retained,
    updating,
    toggleRetained,
    label: intl.formatMessage(
      messages[retained ? 'action.unretain' : 'action.retain'],
    ),
    hint: intl.formatMessage(
      messages[retained ? 'action.unretainHint' : 'action.retainHint'],
    ),
  };
};
