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

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      technicianProfileApi
        .getMyProfile()
        .then((profile) => { if (mounted) setIsAvailable(profile.isAvailable); })
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

  return { isAvailable, toggling, toggle };
}
