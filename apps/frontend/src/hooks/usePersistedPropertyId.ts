import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'hms_selected_property_id';

export function usePersistedPropertyId() {
  const [propertyId, setPropertyIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');

  useEffect(() => {
    if (propertyId) {
      localStorage.setItem(STORAGE_KEY, propertyId);
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
  }, [propertyId]);

  const setPropertyId = useCallback((nextPropertyId: string) => {
    setPropertyIdState(nextPropertyId);
  }, []);

  return [propertyId, setPropertyId] as const;
}
