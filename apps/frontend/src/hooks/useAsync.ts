import { DependencyList, useEffect, useState } from 'react';
import { getApiErrorMessage } from '../api/client';

type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useAsync<T>(load: () => Promise<T>, dependencies: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    setState((current) => ({ ...current, loading: true, error: null }));

    load()
      .then((data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            data: null,
            error: getApiErrorMessage(error),
            loading: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, dependencies);

  return state;
}
