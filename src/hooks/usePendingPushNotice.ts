import { useEffect, useRef } from 'react';
import { onPendingNotice, takePendingNotice } from '../services/push-state';
import type { PushNoticeItem } from '../services/push-routing';

/**
 * A notification screen opens the notice the person tapped in a phone push (PO 28/11/2026),
 * with the same handler as a tap in its own list, so both go to exactly the same screen.
 * Taken once: when the screen mounts, or right away when it is already open.
 */
export function usePendingPushNotice(open: (item: PushNoticeItem) => void): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const run = () => {
      const item = takePendingNotice();
      if (item) openRef.current(item);
    };
    run();
    return onPendingNotice(run);
  }, []);
}
