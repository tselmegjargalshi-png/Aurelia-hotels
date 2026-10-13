import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api.js';

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T) => void;
}

/** Runs an async loader whenever `key` changes; ignores stale responses. */
export function useAsync<T>(loader: () => Promise<T>, key: string): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    loaderRef.current()
      .then((d) => { if (live) setData(d); })
      .catch((e: unknown) => { if (live) setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Something went wrong.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}
