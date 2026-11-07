import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ordersApi, type WarrantyClaimView, type WarrantyCoverageItem } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';
import {
  formatWarrantyDate,
  warrantyClaimDisplayMeta,
  warrantyCoverageLabel,
  warrantyCoverageTerm,
  warrantyCoverageUiStatus,
  warrantyCustomerPromptCopy,
} from './customer-warranty';

/** Every warranty item of this order with its term, and the full history of the customer's requests (open and closed), so nothing needs another screen to be read. */
export function OrderWarrantyClaims({ serviceOrderId, refreshKey }: { serviceOrderId: string; refreshKey?: unknown }) {
  const { colors } = useAppTheme();
  const [claims, setClaims] = useState<WarrantyClaimView[]>([]);
  const [coverages, setCoverages] = useState<WarrantyCoverageItem[]>([]);
  useEffect(() => {
    let current = true;
    ordersApi.getOrderWarrantyClaims(serviceOrderId).then(rows => { if (current) setClaims(rows); }).catch(() => { if (current) setClaims([]); });
    ordersApi.getOrderWarranties(serviceOrderId).then(rows => { if (current) setCoverages(rows); }).catch(() => { if (current) setCoverages([]); });
    return () => { current = false; };
  }, [serviceOrderId, refreshKey]);
  if (!claims.length && !coverages.length) return null;
  const sortedClaims = [...claims].sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0));
  const card = { borderRadius: 12, padding: 12, gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };
  return <View style={{ gap: 8, marginTop: 10 }} testID="order-warranty-claims">
    {coverages.length ? <Text style={{ fontWeight: '700', color: colors.text }}>Hạng mục bảo hành</Text> : null}
    {coverages.map(coverage => {
      const active = warrantyCoverageUiStatus(coverage) === 'ACTIVE';
      return <View key={coverage.id} style={card}>
        <Text style={{ fontWeight: '700', color: colors.text }}>{warrantyCoverageLabel(coverage)}</Text>
        <Text style={{ color: active ? colors.success : colors.textSecondary }}>{warrantyCoverageTerm(coverage)}</Text>
        <Text style={{ color: colors.textSecondary }}>Từ {formatWarrantyDate(coverage.startsAt)}</Text>
      </View>;
    })}
    {sortedClaims.length ? <Text style={{ fontWeight: '700', color: colors.text }}>Lịch sử yêu cầu bảo hành</Text> : null}
    {sortedClaims.map(claim => {
      const waiting = claim.status === 'awaiting_customer' && !claim.customerResponse;
      const coverage = coverages.find(c => c.id === claim.warrantyCoverageId);
      return <View key={claim.id} style={[card, waiting && { backgroundColor: colors.tone.warning.bg, borderColor: colors.warning }]}>
        {coverage ? <Text style={{ fontWeight: '700', color: colors.text }}>{warrantyCoverageLabel(coverage)}</Text> : null}
        <Text style={{ fontWeight: '700', color: colors.text }}>{warrantyClaimDisplayMeta(claim).label}</Text>
        <Text style={{ color: colors.textSecondary }}>Gửi ngày {formatWarrantyDate(claim.submittedAt)}{claim.resolvedAt ? ` · Xong ngày ${formatWarrantyDate(claim.resolvedAt)}` : ''}</Text>
        <Text style={{ color: colors.text }}>{claim.description}</Text>
        {claim.technician ? <Text style={{ color: colors.textSecondary }}>Kỹ thuật viên: {claim.technician.fullName}</Text> : null}
        {claim.resolutionNotes ? <Text style={{ color: colors.text }}>Phản hồi: {claim.resolutionNotes}</Text> : null}
        {waiting ? <Text style={{ color: colors.text }}>{warrantyCustomerPromptCopy(claim).question} Mở bảo hành để trả lời.</Text> : null}
      </View>;
    })}
  </View>;
}
