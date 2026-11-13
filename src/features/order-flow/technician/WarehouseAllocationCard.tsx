// W2 PICKUP (TECHNICIAN 57, 64, 65): the warehouse a pickup request is allocated to, its straight-line
// km from the booking, and the no-stock note. Same read as web TechnicianPartsSection (warehouse-allocation).
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  partRequestsApi, warehouseDistanceText, warehouseStatusText, type WarehouseAllocation,
} from '../../../api/part-requests.api';
import { useAppTheme } from '../../../constants/theme';

export type AllocationRead = WarehouseAllocation | 'error' | null;

/** One read per pickup request; `seq` re-reads after the parts list changes. 'error' = not checked. */
export function useWarehouseAllocations(requests: { id: string; fulfillmentMethod?: string; status: string }[], seq: unknown) {
  const ids = requests.filter(r => r.fulfillmentMethod === 'pickup' && r.status !== 'cancelled').map(r => r.id).join(',');
  const [map, setMap] = useState<Record<string, AllocationRead>>({});
  useEffect(() => {
    if (!ids) return undefined;
    let alive = true;
    Promise.all(ids.split(',').map(id => partRequestsApi.getWarehouseAllocation(id)
      .then((a): [string, AllocationRead] => [id, a]).catch((): [string, AllocationRead] => [id, 'error'])))
      .then(entries => { if (alive) setMap(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [ids, seq]);
  return map;
}

export default function WarehouseAllocationCard({ allocation, requestId }: { allocation: AllocationRead | undefined; requestId: string }) {
  const { colors } = useAppTheme();
  if (allocation === 'error') {
    return <Text style={{ fontSize: 13, color: colors.textSecondary }}>Chưa kiểm tra được kho được phân bổ. Không xác nhận nhận hàng cho tới khi đối chiếu được.</Text>;
  }
  if (!allocation || allocation.mode !== 'warehouse') return null;
  const distance = warehouseDistanceText(allocation);
  const note = warehouseStatusText(allocation);
  return (
    <View testID={`tech-warehouse-${requestId}`} style={{ gap: 4, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
        {allocation.warehouseName || (allocation.status === 'stock_unavailable' ? 'Chưa có kho phân bổ' : 'Kho linh kiện')}
      </Text>
      {!!allocation.warehouseAddress && <Text style={{ fontSize: 13, color: colors.textSecondary }}>{allocation.warehouseAddress}</Text>}
      {!!distance && <Text style={{ fontSize: 13, color: colors.textSecondary }}>{distance}</Text>}
      {!!note && <Text style={{ fontSize: 13, color: allocation.status === 'stock_unavailable' ? colors.tone.warning.text : colors.text }}>{note}</Text>}
    </View>
  );
}
