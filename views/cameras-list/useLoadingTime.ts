import {useMemo, useState} from 'react';

export const useLoadingTime = () => {
  const [startLoadingTime, setStartLoadingTime] = useState<number>();
  const [endLoadingTime, setEndLoadingTime] = useState<number>();
  const loadingTime = useMemo(() => {
    if (
      startLoadingTime &&
      endLoadingTime &&
      endLoadingTime > startLoadingTime
    ) {
      return endLoadingTime - startLoadingTime;
    }

    return undefined;
  }, [endLoadingTime, startLoadingTime]);

  return {
    loadingTime,
    setStartLoadingTime,
    setEndLoadingTime,
  };
};
