import { useEffect, useState } from 'react';
import { getDefaultDisplayName } from '../api/authUtils';

/** The identity provider's suggested display name: `null` while loading, `''` when it has none. */
export function useDefaultDisplayName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getDefaultDisplayName().then((value) => {
      if (!cancelled) setName(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return name;
}
