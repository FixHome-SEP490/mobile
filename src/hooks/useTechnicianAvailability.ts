import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { technicianProfileApi } from '../api/technician-profile.api';
import { extractApiErrorMessage } from '../utils/input-validation';

/** Technician "nhận đơn mới" switch. Refreshes on focus; the in-flight flag blocks double taps. */
export function useTechnicianAvailability() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [autoAccept, setAutoAccept] = useState<boolean | null>(null);
  const [togglingAuto, setTogglingAuto] = useState(false);

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
      return () => { mounted = false; };
    }, []),
  );

  const toggle = useCallback(async () => {
    if (isAvailable === null || toggling) return;
    Haptics.selectionAsync();
    setToggling(true);
    try {
      const updated = await technicianProfileApi.updateMyProfile({ isAvailable: !isAvailable });
      setIsAvailable(updated.isAvailable);
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể cập nhật trạng thái nhận việc.'));
    } finally {
      setToggling(false);
    }
  }, [isAvailable, toggling]);

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

  return { isAvailable, toggling, toggle, autoAccept, togglingAuto, toggleAutoAccept };
}
