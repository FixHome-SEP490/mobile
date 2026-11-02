import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { supportCasesApi } from '../api/support-cases.api';
import { classifyCancelledBooking, type CancelledRebookSource } from '../screens/customer/failed-repair-rebook';

type Phase = 'idle' | 'checking' | 'ready' | 'error';

/**
 * What the "book again" button of a finished or cancelled order does (web #183). A completed order always opens the ordinary
 * "Đặt lại thợ" sheet. A cancelled one first asks the server why it was cancelled: a failed repair and a job a manager closed
 * each have their own draft (and an interrupted job must not invite the previous technician back); an ordinary cancellation
 * keeps the sheet. An unreadable answer offers a retry and never picks a kind.
 */
export function useRebookAction({ bookingId, orderId, status, openSheet }: {
  bookingId: string | null | undefined;
  orderId: string | null | undefined;
  status: string | null | undefined;
  openSheet: () => void;
}) {
  const navigation = useNavigation<any>();
  const cancelled = String(status ?? '').toUpperCase() === 'CANCELLED';
  const [phase, setPhase] = useState<Phase>('idle');
  const [source, setSource] = useState<CancelledRebookSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    if (!cancelled || !bookingId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to ask for a finished order
      setPhase('idle'); setSource(null);
      return undefined;
    }
    setPhase('checking'); setSource(null);
    classifyCancelledBooking(bookingId, orderId ?? null, async (id) => (await supportCasesApi.listMine({ serviceOrderId: id, status: 'resolved', limit: 50 })).data)
      .then((found) => { if (mine === generation.current) { setSource(found); setPhase('ready'); } })
      .catch(() => { if (mine === generation.current) setPhase('error'); });
    return undefined;
  }, [cancelled, bookingId, orderId, attempt]);

  const press = useCallback(() => {
    if (!bookingId) return;
    if (!cancelled) { openSheet(); return; }
    if (phase === 'error') { setAttempt((n) => n + 1); return; }
    if (phase !== 'ready' || !source) return;
    if (source.kind === 'repair-failure') navigation.navigate('CustomerFailedRepairRebook', { sourceBookingIds: source.sourceBookingIds });
    else if (source.kind === 'interrupted') navigation.navigate('CustomerInterruptionRebook', { bookingId });
    else openSheet();
  }, [bookingId, cancelled, navigation, openSheet, phase, source]);

  const label = !cancelled ? 'Đặt lại thợ'
    : phase === 'checking' || phase === 'idle' ? 'Đang kiểm tra đặt lại…'
      : phase === 'error' ? 'Chưa xác định được cách đặt lại. Thử lại'
        : source?.kind === 'repair-failure' ? 'Đặt lại'
          : source?.kind === 'interrupted' ? 'Đặt lịch mới' : 'Đặt lại thợ';
  return { label, press, disabled: cancelled && (phase === 'checking' || phase === 'idle') };
}
