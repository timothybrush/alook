"use client";

import { useState, useLayoutEffect, useCallback } from "react";

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [stored, setStored] = useState<T>(initialValue);

  // Hydrate from localStorage before browser paint to avoid flicker
  useLayoutEffect(() => {
    try {
      const item = localStorage.getItem(key);
      if (item) setStored(JSON.parse(item) as T);
    } catch { /* ignore */ }
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch { /* quota exceeded — silently ignore */ }
        return next;
      });
    },
    [key]
  );

  return [stored, setValue];
}
