import { useState, useEffect, useRef } from 'react';

/**
 * Delays showing a loading indicator so quick operations don't flash a spinner.
 *
 * @param isLoading - Whether the underlying operation is in progress.
 * @param delay - How long, in ms, `isLoading` must stay true before the indicator shows.
 * @returns Whether the loading indicator should be shown.
 */
const useDeferredLoading = (isLoading: boolean, delay = 200): boolean => {
  const [showLoading, setShowLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      timerRef.current = setTimeout(() => setShowLoading(true), delay);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowLoading(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoading, delay]);

  return showLoading;
};

export default useDeferredLoading;
