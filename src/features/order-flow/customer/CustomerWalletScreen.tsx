import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../types';
import { useAuthStore } from '../../../store/auth.store';
import { useCustomerWallet } from './useCustomerWallet';
import { takePendingWalletReturn } from '../../../navigation/customer-wallet-return';
import { parseWholeVndInput } from '../shared/m6-amount-input';
import BackButton from '../../../components/BackButton';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { wholeVnd, type CustomerWalletTransaction } from '../../../api/customer-wallet.api';

const transactionLabels: Record<CustomerWalletTransaction['type'], string> = {
  top_up: 'Nạp tiền',
  invoice_payment: 'Thanh toán hóa đơn',
  refund: 'Hoàn tiền',
  adjustment_credit: 'Điều chỉnh cộng',
  adjustment_debit: 'Điều chỉnh trừ',
  withdrawal: 'Rút tiền',
  withdrawal_refund: 'Hoàn tiền rút tiền',
};

const transactionIcons: Record<CustomerWalletTransaction['type'], React.ComponentProps<typeof Ionicons>['name']> = {
  top_up: 'arrow-down-circle-outline',
  invoice_payment: 'receipt-outline',
  refund: 'refresh-circle-outline',
  adjustment_credit: 'add-circle-outline',
  adjustment_debit: 'remove-circle-outline',
  withdrawal: 'arrow-up-circle-outline',
  withdrawal_refund: 'refresh-circle-outline',
};

function isIncomingTransaction(type: CustomerWalletTransaction['type']): boolean {
  return !['invoice_payment', 'adjustment_debit', 'withdrawal'].includes(type);
}

function transactionAmountText(transaction: CustomerWalletTransaction): string {
  const amount = wholeVnd(transaction.amount);
  if (amount === null) return '—';
  const incoming = isIncomingTransaction(transaction.type);
  const formatted = formatVnd(incoming ? amount : -amount);
  return incoming ? `+${formatted}` : formatted;
}

function parseTopUpAmount(text: string): number | null {
  return parseWholeVndInput(text, { min: 10000, max: 50000000 });
}

interface FrozenTopUpSheet {
  amount: number;
  idempotencyKey: string;
}

/**
 * Customer-only wallet overview + top-up. Separate from any order task and
 * from the Technician wallet. Top-up credit needs the exact returned
 * paymentId + authoritative PAYMENT ledger row; balance changes never count.
 */
export default function CustomerWalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const role = useAuthStore(s => s.user?.role ?? null);
  const { controller, state } = useCustomerWallet();
  const [page, setPage] = useState(1);
  const [amountText, setAmountText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<FrozenTopUpSheet | null>(null);
  const [topUpExpanded, setTopUpExpanded] = useState(false);
  const focused = useIsFocused();

  // Root gate holds a canonical GET-refresh signal (cold getInitialURL or
  // warm url event) even when this screen was not mounted. Spend it here
  // through the frozen GET-only hook; no query flag is ever retained.
  useEffect(() => {
    if (!focused) return;
    if (takePendingWalletReturn()) void controller.verify();
  }, [controller, focused]);

  if (!authenticated || role !== 'customer') {
    return (
      <TaskScreenShell title="Ví FixHome" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>Bạn không có quyền xem nội dung này.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const summary = state.summary.status === 'ready' ? state.summary.data : null;
  const summaryError = state.summary.status === 'error';
  const markerUnknown = state.phase === 'unknown';
  const sheetValid = !!sheet && state.confirmation !== null
    && state.confirmation.dto.amount === sheet.amount
    && state.confirmation.dto.idempotencyKey === sheet.idempotencyKey;
  const totalPages = summary && summary.meta.totalPages >= 1 ? summary.meta.totalPages : 1;

  const request = () => {
    const amount = parseTopUpAmount(amountText);
    if (amount === null) {
      setFormError('Hãy nhập số tiền nạp từ 10.000 ₫ đến 50.000.000 ₫, là số nguyên đồng.');
      return;
    }
    setFormError(null);
    setSheet(null);
    void controller.requestTopUp(amount);
  };

  const openSheet = () => {
    if (!state.confirmation || busy) return;
    setSheet({ amount: state.confirmation.dto.amount, idempotencyKey: state.confirmation.dto.idempotencyKey });
  };

  const cancelSheet = () => {
    controller.cancelConfirmation();
    setSheet(null);
  };

  const submitSheet = () => {
    if (!sheetValid || busy) return;
    setSheet(null);
    void controller.submitConfirmation();
  };

  const changePage = (next: number) => {
    if (busy || next < 1 || next > totalPages || next === page) return;
    setPage(next);
    void controller.verify(next);
  };

  const topUpAction = sheetValid && sheet
    ? { label: `Xác nhận nạp ${formatVnd(sheet.amount)}`, testID: 'wallet-topup-submit', onPress: submitSheet }
    : state.confirmation && !sheet
      ? { label: 'Xem lại và xác nhận', testID: 'wallet-topup-open-sheet', onPress: openSheet }
      : state.urlReady
        ? { label: 'Mở cổng nạp tiền', testID: 'wallet-topup-open-browser', onPress: () => { if (!busy) void controller.openPaymentUrl(); } }
        : { label: busy ? 'Đang xử lý…' : 'Kiểm tra số tiền nạp', testID: 'wallet-topup-request', onPress: request };


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.page}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerEyebrow}>Ví của tôi</Text>
          <Text accessibilityRole="header" style={styles.headerTitle}>Ví FixHome</Text>
        </View>
        <TouchableOpacity
          testID="wallet-refresh"
          accessibilityRole="button"
          accessibilityLabel="Làm mới"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => { if (!busy) void controller.verify(page); }}
          style={styles.iconBtn}
        >
          <Ionicons name="refresh-outline" size={22} color={colors.primaryStrong} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={state.phase === 'verifying'} onRefresh={() => { if (!busy) void controller.verify(page); }} />}
      >
        <View testID="wallet-balance-hero" style={styles.heroCard}>
          <View style={styles.heroCaptionRow}>
            <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
            <Text style={styles.heroCaption}>Số dư khả dụng</Text>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.heroBalance}>
            {summary ? formatVnd(Number(summary.balance)) : summaryError ? 'Chưa tải được số dư' : 'Đang tải…'}
          </Text>
          {summaryError ? (
            <Text style={styles.heroNote}>Số dư lỗi không được xem như số dư 0; hãy làm mới.</Text>
          ) : null}
        </View>
        <View testID="wallet-primary-actions" style={styles.heroActions}>
          <TouchableOpacity
            testID="wallet-topup-expand"
            accessibilityRole="button"
            accessibilityLabel="Nạp tiền"
            accessibilityState={{ expanded: topUpExpanded, disabled: busy }}
            disabled={busy}
            onPress={() => setTopUpExpanded(expanded => !expanded)}
            activeOpacity={0.8}
            style={[styles.primaryBtn, busy && styles.disabled]}
          >
            <Ionicons name="add" size={20} color={colors.surface} />
            <Text style={styles.primaryBtnText}>Nạp tiền</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="wallet-withdraw-open"
            accessibilityRole="button"
            accessibilityLabel="Rút tiền"
            onPress={() => navigation.navigate('CustomerWithdraw')}
            activeOpacity={0.8}
            style={styles.secondaryBtn}
          >
            <Ionicons name="arrow-up" size={20} color={colors.primaryStrong} />
            <Text style={styles.secondaryBtnText}>Rút tiền</Text>
          </TouchableOpacity>
        </View>
        {markerUnknown ? (
          <ReadOnlyNotice>Lần nạp trước chưa rõ kết quả. Hãy kiểm tra sổ giao dịch bên dưới; không tạo yêu cầu nạp mới khi còn thao tác chưa rõ.</ReadOnlyNotice>
        ) : null}
        {topUpExpanded ? (
          <View testID="wallet-topup-panel" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing.md, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="wallet-outline" size={20} color={colors.primaryStrong} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Nạp tiền vào ví</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                  Từ 10.000 ₫ đến 50.000.000 ₫. Nạp tiền không tự thanh toán hóa đơn.
                </Text>
              </View>
            </View>
            <TextInput
              testID="wallet-topup-amount"
              accessibilityLabel="Số tiền nạp"
              keyboardType="numeric"
              editable={!busy && !markerUnknown}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="Ví dụ 100000"
              placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 50, paddingHorizontal: spacing.md, fontSize: 16, color: colors.text, backgroundColor: colors.surface }}
            />
            {sheetValid && sheet ? (
              <View style={{ backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.fg, borderWidth: 1, borderRadius: 12, padding: spacing.md, gap: spacing.xs }} testID="wallet-topup-sheet">
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.tone.warning.text }}>Xác nhận nạp tiền</Text>
                <DetailRow label="Số tiền đã chốt" value={formatVnd(sheet.amount)} />
                <TouchableOpacity
                  testID="wallet-topup-cancel"
                  accessibilityRole="button"
                  accessibilityLabel="Hủy xác nhận nạp tiền"
                  disabled={busy}
                  onPress={cancelSheet}
                  style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Hủy xác nhận</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {formError ? <Text style={{ color: colors.error, fontSize: 14 }} accessibilityRole="alert">{formError}</Text> : null}
            {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
            <TouchableOpacity
              testID={topUpAction.testID}
              accessibilityRole="button"
              accessibilityHint={topUpAction.testID === 'wallet-topup-submit' ? 'Tạo một liên kết nạp tiền đúng số tiền đã chốt' : undefined}
              disabled={busy || markerUnknown}
              onPress={topUpAction.onPress}
              activeOpacity={0.8}
              style={{ minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', opacity: busy || markerUnknown ? 0.55 : 1 }}
            >
              <Text style={{ color: colors.surface, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{topUpAction.label}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.listBlock}>
          <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
          {!summary ? (
            <Text style={styles.mutedText}>Đang tải sổ giao dịch…</Text>
          ) : summary.transactions.length === 0 ? (
            <Text style={styles.mutedText}>Chưa có giao dịch nào.</Text>
          ) : (
            summary.transactions.map(tx => {
              const incoming = isIncomingTransaction(tx.type);
                return (
                <View key={tx.id} testID={`wallet-tx-${tx.id}`} style={styles.txCard}>
                  <View style={styles.txMain}>
                    <View testID={`wallet-tx-icon-${tx.id}`} style={[styles.txIcon, { backgroundColor: incoming ? colors.tone.success.bg : colors.tone.info.bg }]}>
                      <Ionicons name={transactionIcons[tx.type]} size={20} color={incoming ? colors.tone.success.fg : colors.tone.info.fg} />
                    </View>
                    <View style={styles.txCopy}>
                      <Text style={styles.rowTitle}>{transactionLabels[tx.type]}</Text>
                      <Text style={styles.caption}>{vnDateTimeString(tx.createdAt)}</Text>
                    </View>
                    <Text style={[styles.txAmount, incoming && { color: colors.tone.success.text }]}>
                      {transactionAmountText(tx)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
        {summary && totalPages > 1 ? (
          <View style={styles.pagerRow}>
            <TouchableOpacity
              testID="wallet-page-prev"
              accessibilityRole="button"
              accessibilityLabel="Trang giao dịch trước"
              disabled={busy || page <= 1}
              onPress={() => changePage(page - 1)}
              style={styles.textBtn}
            >
              <Text style={[styles.textBtnLabel, (busy || page <= 1) && styles.pagerTextDisabled]}>Trước</Text>
            </TouchableOpacity>
            <Text style={styles.bodySmall}>Trang {page}/{totalPages}</Text>
            <TouchableOpacity
              testID="wallet-page-next"
              accessibilityRole="button"
              accessibilityLabel="Trang giao dịch sau"
              disabled={busy || page >= totalPages}
              onPress={() => changePage(page + 1)}
              style={styles.textBtn}
            >
              <Text style={[styles.textBtnLabel, (busy || page >= totalPages) && styles.pagerTextDisabled]}>Sau</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// Same look as the technician wallet: header with an eyebrow, a dark balance card, one filled and one outlined
// action, ledger rows as cards, text buttons to page.
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  headerTitleGroup: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 1 },
  headerEyebrow: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, fontWeight: '600' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  heroCard: { backgroundColor: '#193E70', borderRadius: 20, padding: 16, gap: 8 },
  heroCaptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroCaption: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#FFFFFF' },
  heroBalance: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: '#FFFFFF' },
  heroNote: { fontSize: 12, lineHeight: 18, color: '#EAF2FF' },
  heroActions: { flexDirection: 'row', gap: 12 },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, paddingHorizontal: 16 },
  primaryBtnText: { color: colors.surface, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primaryStrong, backgroundColor: colors.surface, paddingHorizontal: 16 },
  secondaryBtnText: { color: colors.primaryStrong, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  listBlock: { gap: 8 },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text, paddingTop: 4 },
  mutedText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  txCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  txMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txCopy: { flex: 1, minWidth: 0, gap: 2 },
  txAmount: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text, textAlign: 'right' },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  caption: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  bodySmall: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  textBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  textBtnLabel: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  pagerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  pagerTextDisabled: { color: colors.muted },
});
