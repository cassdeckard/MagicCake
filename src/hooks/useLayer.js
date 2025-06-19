import { useState, useCallback } from 'react';

const MAX_LAYER_VALUE = 327;

export function useLayer(id, initialValue) {
  const [value, setValue] = useState(initialValue);

  // Shifts layer by direction vector
  const shift = useCallback((direction) => {
    setValue(prev => prev + direction);
  }, []);

  // Randomize Layer
  const randomize = useCallback((extra = 0) => {
    console.log(`randomize; extra: ${extra}`);
    const newLayer = (Math.floor(Math.random() * 150) + extra) % MAX_LAYER_VALUE;
    setValue(newLayer);
  }, []);

  const zero = useCallback(() => {
    console.log(`zero`);
    setValue(0);
  }, []);

  return {
    value,
    setValue,
    shift,
    randomize,
    zero
  };
} 