import { useEffect } from 'react';

// Report only the current startup stage, never account or health information.
export default function useBootStatus(stage) {
  useEffect(() => {
    window.__stackdBoot?.pending(stage);
    return () => window.__stackdBoot?.pending(null);
  }, [stage]);
}