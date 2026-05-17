import { useCallback, useEffect, useRef } from "react";

export function useStableEventCallback<T extends (...args: any[]) => void>(callback: T): T {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}
