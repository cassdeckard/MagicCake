import { useState, useEffect } from 'react';

export function useTimer(initialValue) {
  const [value, setValue] = useState(initialValue);

  // One second ticker
  useEffect(() => {
    const interval = setInterval(() => setValue(value + 1), 1000);
    return () => clearInterval(interval);
  }, [value]);

  return value;
}

