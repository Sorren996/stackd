import { useEffect } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function BootRoot({ App }) {
  useEffect(() => {
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        window.__stackdBooted = true;
        window.__stackdBoot?.painted();
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);
  return <ErrorBoundary><App /></ErrorBoundary>;
}