import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import {
  canDeclareMoreQty,
  partReturnStatusText,
  pendingDeclaredQty,
  usedQtyRange,
  type PartCustodyReturnRecord,
} from '../../../api/part-requests.api';
import type { OrderPartReadModel } from '../domain/order-session.types';
import { lightTheme as colors, spacing, type ToneName } from '../../../constants/theme';

type Item = OrderPartReadModel['items'][number];

/** Stable label + tone (never colour alone): what the technician still has to settle on this line. */
function usageView(usage: Item['usageStatus'], received: boolean): { label: string; tone: ToneName } | null {
  if (usage === 'used') return { label: 'Đã dùng', tone: 'success' };
  if (usage === 'returned') return { label: 'Đã báo trả', tone: 'neutral' };
  return received ? { label: 'Chưa ghi dùng/trả', tone: 'warning' } : null;
}

function Stepper({ value, min, max, label, onChange }: { value: number; min: number; max: number; label: string; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Giảm ${label}`} accessibilityState={{ disabled: value <= min }} disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))} style={({ pressed }) => [styles.stepBtn, value <= min && styles.dim, pressed && styles.pressed]}>
        <Minus size={18} strokeWidth={1.75} color={colors.primaryStrong} />
      </Pressable>
      <Text accessibilityLabel={`${label} ${value}`} style={styles.stepValue}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Tăng ${label}`} accessibilityState={{ disabled: value >= max }} disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))} style={({ pressed }) => [styles.stepBtn, value >= max && styles.dim, pressed && styles.pressed]}>
        <Plus size={18} strokeWidth={1.75} color={colors.primaryStrong} />
      </Pressable>
    </View>
  );
}

function ActionButton({ testID, label, primary, disabled, onPress }: { testID: string; label: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, disabled && styles.dim, pressed && styles.pressed]}>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One part line of a request. Without a custody record the technician settles the whole line (used or
 * given back). With one (the quantities FixHome issued) they record the exact used quantity, e.g. issued 3,
 * used 1, return 2, and declare what they hand back; the Service Manager confirms at the counter.
 */
export function PartItemRow({ item, received, canMarkUsage, frozen, record, busy, quotedQty, maxUsed, onWhole, onSaveUsed, onDeclare }: {
  item: Item; received: boolean; canMarkUsage: boolean; frozen: boolean; record?: PartCustodyReturnRecord; busy: boolean;
  /** Quantity of this SKU on the approved quotation; undefined when there is no approved quotation line for it. */
  quotedQty?: number;
  /** Approved quotation quantity left for this SKU; the Backend rejects more. Undefined when not limited or not known. */
  maxUsed?: number;
  onWhole: (status: 'used' | 'returned') => void;
  onSaveUsed: (quantity: number) => Promise<boolean>;
  onDeclare: (quantity: number) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'usage' | 'declare' | null>(null);
  const [qty, setQty] = useState(0);
  // Everything issued is declared back and nothing was used: there is no usage left to ask for, so settle it as "used 0"
  // right away. The manager's receipt is a separate step and never holds up the handover.
  const fullyReturned = !!record && record.issuedQty > 0 && record.usedQty === 0 && record.declaredQty >= record.issuedQty;
  const fullyAccepted = fullyReturned && record!.managerAcceptedQty >= record!.issuedQty;
  // "Đã trả lại" is only said once the manager has received it; until then the technician has only reported it.
  const view = fullyReturned
    ? (fullyAccepted ? { label: 'Đã trả lại', tone: 'neutral' as ToneName } : { label: 'Đã khai trả', tone: 'info' as ToneName })
    : usageView(item.usageStatus, received);
  const tone = view ? colors.tone[view.tone] : null;
  const base = record ? usedQtyRange(record) : null;
  const range = base && { min: base.min, max: maxUsed === undefined ? base.max : Math.max(base.min, Math.min(base.max, maxUsed)) };
  const capped = !!base && !!range && range.max < base.max;
  const declareMax = record ? canDeclareMoreQty(record) : 0;
  const pending = record ? pendingDeclaredQty(record) : 0;
  // Usage is recorded, so what is left to hand back is known: one tap declares all of it.
  const quickDeclare = !!record && record.usageRecorded === true && record.usedQty < record.issuedQty && declareMax > 0;
  // Older Backends send no status: fall back to the quantities.
  const note = record ? (record.returnStatus ? partReturnStatusText(record.returnStatus)
    : pending > 0 ? partReturnStatusText('declared') : record.outstandingQty === 0 ? partReturnStatusText('received') : null) : null;
  const locked = frozen || busy;
  const done = async (action: Promise<boolean>) => { if (await action) setMode(null); };
  const settled = useRef(false);
  useEffect(() => {
    if (!fullyReturned || record?.usageRecorded === true || item.usageStatus !== 'pending' || !received || !canMarkUsage || locked || settled.current) return;
    settled.current = true;
    void onSaveUsed(0);
  });
  const open = (next: 'usage' | 'declare') => { setQty(next === 'usage' ? record!.usedQty : quickDeclare ? declareMax : 1); setMode(next); };

  return (
    <View testID={`parts-item-${item.id}`} style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.name}>{item.partNameSnapshot || 'Linh kiện'}</Text>
        {view && tone ? <View style={[styles.chip, { backgroundColor: tone.bg }]}><Text style={[styles.chipText, { color: tone.text }]}>{view.label}</Text></View> : null}
      </View>
      <Text style={styles.meta}>
        {record
          ? [quotedQty === undefined ? null : `Báo giá duyệt ${quotedQty}`, `Số lượng ${record.issuedQty}`, record.usageRecorded ? `Đã dùng ${record.usedQty}` : null, record.usageRecorded && record.outstandingQty > 0 ? `Còn phải trả ${record.outstandingQty}` : null].filter(Boolean).join(' · ')
          : [quotedQty === undefined ? null : `Báo giá duyệt ${quotedQty}`, `Số lượng ${item.quantity}`].filter(Boolean).join(' · ')}
      </Text>
      {note ? <Text style={[styles.meta, { color: colors.tone[note.tone].text }]}>{note.text}</Text> : null}

      {received && canMarkUsage && !record && (
        <View style={styles.actions}>
          <ActionButton testID={`parts-usage-used-${item.id}`} label="Đã dùng" primary={item.usageStatus === 'used'} disabled={locked || item.usageStatus === 'used'} onPress={() => onWhole('used')} />
          <ActionButton testID={`parts-usage-returned-${item.id}`} label="Hoàn trả" primary={item.usageStatus === 'returned'} disabled={locked || item.usageStatus === 'returned'} onPress={() => onWhole('returned')} />
        </View>
      )}

      {record && mode === 'usage' && range && (
        <View testID={`part-usage-editor-${item.id}`} style={styles.panel}>
          <Text style={styles.panelTitle}>Số lượng đã dùng</Text>
          <Stepper value={qty} min={range.min} max={range.max} label="số lượng đã dùng" onChange={setQty} />
          {capped ? <Text style={[styles.meta, { color: colors.tone.warning.text }]}>{`Báo giá đã duyệt chỉ cho dùng tối đa ${range.max}. Phần còn lại hãy khai trả về kho.`}</Text> : null}
          <Text style={styles.meta}>Đã nhận {record.issuedQty} · Cần trả {record.issuedQty - qty}. Hóa đơn chỉ tính số đã dùng; số còn lại phải trả về kho.</Text>
          <View style={styles.actions}>
            <ActionButton testID={`part-usage-save-${item.id}`} label="Lưu số lượng" primary disabled={locked || (record.usageRecorded === true && qty === record.usedQty)} onPress={() => void done(onSaveUsed(qty))} />
            <ActionButton testID={`part-usage-cancel-${item.id}`} label="Hủy" disabled={busy} onPress={() => setMode(null)} />
          </View>
        </View>
      )}

      {record && mode === 'declare' && (
        <View testID={`part-declare-editor-${item.id}`} style={styles.panel}>
          <Text style={styles.panelTitle}>Số lượng khai trả</Text>
          <Stepper value={qty} min={1} max={declareMax} label="số lượng trả" onChange={setQty} />
          <Text style={styles.meta}>Quản lý dịch vụ sẽ nhận linh kiện và xác nhận số lượng thực tế. Khai trả chưa phải là đã trả xong.</Text>
          <View style={styles.actions}>
            <ActionButton testID={`part-declare-send-${item.id}`} label="Gửi khai trả" primary disabled={locked || qty < 1 || qty > declareMax} onPress={() => void done(onDeclare(qty))} />
            <ActionButton testID={`part-declare-cancel-${item.id}`} label="Hủy" disabled={busy} onPress={() => setMode(null)} />
          </View>
        </View>
      )}

      {record && mode === null && (
        <View style={styles.actions}>
          {received && canMarkUsage && !fullyReturned && <ActionButton testID={`part-usage-open-${item.id}`} label={record.usageRecorded ? 'Sửa số lượng đã dùng' : 'Ghi số lượng đã dùng'} primary={!record.usageRecorded} disabled={locked} onPress={() => open('usage')} />}
          {declareMax > 0 && <ActionButton testID={`part-declare-open-${item.id}`} label={quickDeclare ? `Khai trả ${declareMax} cái còn lại` : 'Khai trả'} primary={quickDeclare} disabled={locked} onPress={() => open('declare')} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: spacing.md, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  chip: { flexShrink: 0, maxWidth: '50%', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  action: { flexGrow: 1, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  actionTextPrimary: { color: colors.surface, fontWeight: '700' },
  panel: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, gap: 8 },
  panelTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 40, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '700' },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
