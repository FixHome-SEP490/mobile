import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Camera, ChevronRight, ClipboardList, FileText, HandCoins, History, Info, NotebookPen, Package, ReceiptText, Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';
import { lightTheme as colors, spacing } from '../../../constants/theme';

type HubScreen = 'PartsLifecycle' | 'OrderInformation' | 'ScopeDetail' | 'PersonalOrderNotes' | 'OrderProgressHistory'
  | 'AfterEvidence' | 'CompletionRequest' | 'CashDeclaration' | 'ExtraProposal';

const MANAGE: { screen: HubScreen; label: string; Icon: LucideIcon }[] = [
  { screen: 'PartsLifecycle', label: 'Linh kiện', Icon: Package },
  { screen: 'ScopeDetail', label: 'Phạm vi và báo giá', Icon: ClipboardList },
  { screen: 'OrderInformation', label: 'Thông tin đơn', Icon: Info },
  { screen: 'PersonalOrderNotes', label: 'Ghi chú riêng trên thiết bị', Icon: NotebookPen },
  { screen: 'OrderProgressHistory', label: 'Xem tiến độ', Icon: History },
];

/** Only valid while the order is UNDER_REPAIR (backend rejects them earlier). */
const REPAIR: { screen: HubScreen; label: string; Icon: LucideIcon }[] = [
  { screen: 'ExtraProposal', label: 'Đề xuất chi phí phát sinh', Icon: ReceiptText },
  { screen: 'AfterEvidence', label: 'Chụp ảnh sau sửa chữa', Icon: Camera },
  { screen: 'CompletionRequest', label: 'Bàn giao và yêu cầu thanh toán', Icon: FileText },
  { screen: 'CashDeclaration', label: 'Khai báo tiền mặt đã nhận', Icon: HandCoins },
];

function Row({ screen, label, Icon, hint, disabled, last, onPress }: {
  screen: HubScreen; label: string; Icon: LucideIcon; hint?: string; disabled: boolean; last: boolean; onPress: () => void;
}) {
  const tone = hint ? colors.tone.warning : colors.tone.neutral;
  return (
    <Pressable
      testID={`task-link-${screen}`}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.tile, { backgroundColor: hint ? tone.bg : colors.primarySoft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon size={20} strokeWidth={1.75} color={hint ? tone.fg : colors.primaryStrong} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {hint ? <View style={[styles.badge, { backgroundColor: tone.bg }]}><Text style={[styles.badgeText, { color: tone.text }]}>{hint}</Text></View> : null}
      <ChevronRight size={20} strokeWidth={1.75} color={colors.muted} />
    </Pressable>
  );
}

/**
 * Always-available management shortcuts for the technician, shown under the current step so
 * the one-way task flow never hides parts, scope or notes. Navigation only; backend gates every action.
 */
export default function TechnicianOrderHub() {
  const { key, snapshot, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  useLoadUnloadedResources(snapshot, ['parts'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || order.technician?.id !== key.userId || order.id !== key.serviceOrderId;
  const parts = snapshot?.resources.parts;
  const waiting = parts?.status === 'ready' && Array.isArray(parts.data)
    ? parts.data.filter(pr => pr.serviceOrderId === key?.serviceOrderId && pr.technicianId === key?.userId
      && ((pr.fulfillmentMethod === 'pickup' && pr.status === 'ready') || (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering'))).length
    : 0;
  const repairing = order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt;
  const open = (screen: HubScreen) => { if (!revoked) navigation.navigate(screen as never); };
  const render = (items: typeof MANAGE) => items.map((item, i) => (
    <Row key={item.screen} {...item} disabled={revoked} last={i === items.length - 1} onPress={() => open(item.screen)}
      hint={item.screen === 'PartsLifecycle' && waiting > 0 ? `${waiting} chờ nhận` : undefined} />
  ));

  return (
    <View style={styles.wrap}>
      {repairing && <>
        <View style={styles.titleRow}><Wrench size={16} strokeWidth={1.75} color={colors.textSecondary} /><Text accessibilityRole="header" style={styles.title}>Bước sửa chữa</Text></View>
        <View style={styles.card}>{render(REPAIR)}</View>
      </>}
      <Text accessibilityRole="header" style={styles.title}>Quản lý đơn</Text>
      <View style={styles.card}>{render(MANAGE)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 8 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.divider },
  disabled: { opacity: 0.5 },
  tile: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
