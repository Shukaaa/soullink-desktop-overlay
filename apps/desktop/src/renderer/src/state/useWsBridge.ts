import { useEffect } from 'react';
import { useAppStore } from './store';

/**
 * Subscribes this renderer window to the main process's WsEvent broadcast
 * channel for as long as the component using it is mounted.
 */
export function useWsBridge(): void {
  const applyWsEvent = useAppStore((s) => s.applyWsEvent);

  useEffect(() => {
    const unsubscribe = window.api.onEvent(applyWsEvent);
    return unsubscribe;
  }, [applyWsEvent]);
}
