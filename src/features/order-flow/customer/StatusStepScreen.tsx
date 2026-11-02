import React from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';

/**
 * C03, C04 and C06 share one read-only body: the order frame above already shows the technician, appointment and
 * address, so this says only what is happening, and the footer button calls the technician.
 */
export default function StatusStepScreen({ title, stage, message }: { title: string; stage: 1 | 2 | 3 | 4; message: string }) {
  const { key, snapshot } = useOrderSession();
  const navigation = useNavigation<any>();
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order;
  const phone = order?.technician?.phoneNumber;
  return (
    <TaskScreenShell
      title={title}
      stage={stage}
      onBack={() => navigation.goBack()}
      primary={phone ? { label: 'Gọi kỹ thuật viên', testID: 'task-call', onPress: () => void Linking.openURL(`tel:${phone}`) } : undefined}
    >
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc dữ liệu chưa sẵn sàng. Bản nháp cục bộ đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>{message}</ReadOnlyNotice>
      )}
    </TaskScreenShell>
  );
}
