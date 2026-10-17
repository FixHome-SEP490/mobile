import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { technicianProfileApi } from '../api/technician-profile.api';
import { walletApi } from '../api/wallet.api';
import { availabilityText } from '../utils/availability';
import { formatVnd } from '../utils/format';
import { extractApiErrorMessage } from '../utils/input-validation';

/** Technician "nhận đơn mới" switch. Refreshes on focus; the in-flight flag blocks double taps. */
export function useTechnicianAvailability() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [autoAccept, setAutoAccept] = useState<boolean | null>(null);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [status, setStatus] = useState<{ title: string; detail: string; receiving: boolean } | null>(null);

  /** What the switch means right now (schedule, time off); the manual flag alone when the read fails. */
  const refreshStatus = useCallback(() => {
    technicianProfileApi.getMyAvailability().then((a) => setStatus(availabilityText(a))).catch(() => setStatus(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      technicianProfileApi
        .getMyProfile()
        .then((profile) => {
          if (!mounted) return;
          setIsAvailable(profile.isAvailable);
          setAutoAccept(profile.autoAcceptInvitations);
        })
        .catch(() => {});
      refreshStatus();
      return () => { mounted = false; };
    }, [refreshStatus]),
  );

  const toggle = useCallback(async () => {
    if (isAvailable === null || toggling) return;
    Haptics.selectionAsync();
    setToggling(true);
    try {
      // Below the deposit floor the switch cannot go on (as on web). A failed wallet read leaves it to the server.
      if (!isAvailable) {
        const wallet = await walletApi.getMyWallet().catch(() => null);
        if (wallet && !wallet.eligibleForJobs) {
          Alert.alert('Ví chưa đủ mức ký quỹ', `Cần tối thiểu ${formatVnd(wallet.minimumBalance)} để nhận việc. Vui lòng nạp tiền vào ví.`);
          return;
        }
      }
      const updated = await technicianProfileApi.updateMyProfile({ isAvailable: !isAvailable });
      setIsAvailable(updated.isAvailable);
      refreshStatus();
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể cập nhật trạng thái nhận việc.'));
    } finally {
      setToggling(false);
    }
  }, [isAvailable, toggling, refreshStatus]);

  /** Resolves true when the switch was saved, so the caller can reload invitations the backend just took. */
  const toggleAutoAccept = useCallback(async (): Promise<boolean> => {
    if (autoAccept === null || togglingAuto) return false;
    Haptics.selectionAsync();
    setTogglingAuto(true);
    try {
      const updated = await technicianProfileApi.updateMyProfile({ autoAcceptInvitations: !autoAccept });
      setAutoAccept(updated.autoAcceptInvitations);
      return true;
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Chưa đổi được chế độ tự nhận việc. Vui lòng thử lại.'));
      return false;
    } finally {
      setTogglingAuto(false);
    }
  }, [autoAccept, togglingAuto]);

  return { isAvailable, status, toggling, toggle, autoAccept, togglingAuto, toggleAutoAccept };
}
