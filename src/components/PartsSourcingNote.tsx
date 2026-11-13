// F3 (CUSTOMER 72, TECHNICIAN 66), same as web QuotationPartsSourcingNote.vue: a pending quote whose
// FixHome parts no warehouse can supply. One small read per pending quote; a failed read shows nothing
// (the approval itself still decides on the server).
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import ToneNote from './ToneNote';
import { useAppTheme } from '../constants/theme';
import { missingPartsText, needsSourcingCheck, partsSourcingApi, type PartsSourcing } from '../api/parts-sourcing.api';

type QuoteLike = Parameters<typeof needsSourcingCheck>[0];

export function sourcingNoteText(sourcing: PartsSourcing | null, audience: 'customer' | 'technician'): string | null {
  if (sourcing?.status !== 'unavailable') return null;
  const parts = missingPartsText(sourcing.missing);
  const head = parts ? `Chưa có kho FixHome nào đủ: ${parts}.` : 'Chưa có kho FixHome nào đủ linh kiện của báo giá.';
  return audience === 'customer'
    ? `${head} Báo giá này chưa duyệt được. Kỹ thuật viên sẽ gửi báo giá khác hoặc chờ kho bổ sung. Bạn vẫn có thể từ chối báo giá.`
    : `${head} Khách chưa duyệt được báo giá này. Bấm "Gửi lại báo giá khác" để bỏ hoặc đổi linh kiện thiếu (ví dụ dùng linh kiện bạn tự mua), hoặc chờ kho bổ sung rồi nhờ khách duyệt lại.`;
}

export default function PartsSourcingNote({ quote, audience, refreshKey, onRevise, onSourcing }: {
  quote: QuoteLike; audience: 'customer' | 'technician'; refreshKey?: unknown;
  onRevise?: () => void; onSourcing?: (sourcing: PartsSourcing | null) => void;
}) {
  const { colors } = useAppTheme();
  const [sourcing, setSourcing] = useState<PartsSourcing | null>(null);
  const [checking, setChecking] = useState(false);

  const needs = needsSourcingCheck(quote);
  const quoteId = quote?.id ?? null;
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!needs || !quoteId) return undefined;
    let alive = true;
    partsSourcingApi.get(quoteId)
      .then((answer) => { if (alive) { setSourcing(answer); onSourcing?.(answer); } })
      .catch(() => { if (alive) { setSourcing(null); onSourcing?.(null); } })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [needs, quoteId, refreshKey, onSourcing, nonce]);

  const text = needs && sourcing?.quotationId === quoteId ? sourcingNoteText(sourcing, audience) : null;
  if (!text) return null;
  return (
    <View style={{ gap: 6, marginTop: 8 }} testID="parts-sourcing-note">
      <ToneNote tone="warning" icon={AlertTriangle}>{text}</ToneNote>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        {audience === 'technician' && onRevise ? (
          <TouchableOpacity accessibilityRole="button" onPress={onRevise} testID="parts-sourcing-revise" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.primaryStrong, fontWeight: '600' }}>Gửi lại báo giá khác</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity accessibilityRole="button" disabled={checking} onPress={() => { setChecking(true); setNonce((n) => n + 1); }} testID="parts-sourcing-recheck" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.primaryStrong, fontWeight: '600', opacity: checking ? 0.6 : 1 }}>{checking ? 'Đang kiểm tra kho…' : 'Kiểm tra lại kho'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
