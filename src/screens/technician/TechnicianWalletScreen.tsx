import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store';
import { walletApi } from '../../api/wallet.api';
import { useAppTheme } from '../../constants/theme';
import type { RootStackParamList } from '../../types';
import type { WalletTransaction, WalletTxType, WithdrawalRequest } from '../../types/wallet.types';
import {
  MIN_TOP_UP,
  MIN_WITHDRAWAL,
  createWalletController,
  initialWalletState,
  type WalletUiState,
} from './technician-wallet';

const TOP_UP_PRESETS = [100_000, 200_000, 500_000, 1_000_000];
const BANKS = [
  'Vietcombank', 'Techcombank', 'MB Bank', 'BIDV',
  'VietinBank', 'ACB', 'VPBank', 'TPBank',
];

const TX_FILTERS: { value: WalletTxType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ONLINE_EARNING', label: 'Thu nhập' },
  { value: 'PLATFORM_FEE', label: 'Phí nền tảng' },
  { value: 'TOP_UP', label: 'Nạp tiền' },
  { value: 'WITHDRAW', label: 'Rút tiền' },
  { value: 'ADJUSTMENT', label: 'Điều chỉnh' },
];

const TX_TYPE_LABELS: Record<WalletTxType, string> = {
  TOP_UP: 'Nạp tiền',
  WITHDRAW: 'Rút tiền',
  ONLINE_EARNING: 'Thu nhập đơn online',
  PLATFORM_FEE: 'Phí nền tảng (đơn tiền mặt)',
  ADJUSTMENT: 'Điều chỉnh bởi Admin',
};

const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalRequest['status'], string> = {
  PENDING: 'Đang chờ duyệt',
  SUCCESS: 'Đã chuyển khoản',
  REJECTED: 'Đã từ chối',
  FAILED: 'Thất bại',
};

function formatVND(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TechnicianWalletScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthStore();

  const [state, setState] = useState<WalletUiState>(initialWalletState);
  const focusAliveRef = useRef(false);
  const controllerRef = useRef<ReturnType<typeof createWalletController> | null>(null);
  const technicianId = user?.id ?? null;

  useEffect(() => {
    controllerRef.current = createWalletController(
      {
        getTechnicianId: () => technicianId,
        isFocused: () => focusAliveRef.current,
        getWallet: () => walletApi.getMyWallet(),
        getTransactions: (page, type) =>
          walletApi.getMyTransactions({ page, limit: 15, type }),
        getWithdrawals: (page) => walletApi.getMyWithdrawals({ page, limit: 15 }),
        topUp: (amount) => walletApi.topUp(amount),
        requestWithdrawal: (dto) => walletApi.requestWithdrawal(dto),
        openExternalUrl: (url) => Linking.openURL(url),
        onAccessDenied: () => {
          Alert.alert('Phiên đăng nhập hết hạn', 'Vui lòng đăng nhập lại.');
          navigation.navigate('Auth');
        },
      },
      setState,
    );
    return () => {
      controllerRef.current = null;
    };
  }, [technicianId, navigation]);

  useFocusEffect(
    useCallback(() => {
      focusAliveRef.current = true;
      void controllerRef.current?.focus();
      return () => {
        focusAliveRef.current = false;
      };
    }, []),
  );

  // VNPay top-up return is not proof of payment: when the app comes back to the
  // foreground, refresh the authoritative wallet balance instead of trusting the redirect.
  useEffect(() => {
    if (!state.topUpPending) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && focusAliveRef.current) {
        void controllerRef.current?.reconcileTopUp();
      }
    });
    return () => subscription.remove();
  }, [state.topUpPending]);

  const [activeTab, setActiveTab] = useState<'transactions' | 'withdrawals'>('transactions');
  const [topUpVisible, setTopUpVisible] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState(BANKS[0]);
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState('');
  const [withdrawAccountName, setWithdrawAccountName] = useState('');

  const summary = state.summary;
  const hasPendingWithdrawal = state.withdrawals.some((w) => w.status === 'PENDING');

  const onRefresh = () => {
    void controllerRef.current?.refreshAll();
  };

  const submitTopUp = async () => {
    const ok = await controllerRef.current?.startTopUp(Number(topUpAmount.replace(/\D/g, '')) || 0);
    if (ok) {
      setTopUpVisible(false);
      setTopUpAmount('');
    }
  };

  const submitWithdraw = async () => {
    const ok = await controllerRef.current?.submitWithdrawal({
      amount: Number(withdrawAmount.replace(/\D/g, '')) || 0,
      bankName: withdrawBank,
      bankAccountNumber: withdrawAccountNumber.trim(),
      bankAccountName: withdrawAccountName.trim().toUpperCase(),
    });
    if (ok) {
      setWithdrawVisible(false);
      setWithdrawAmount('');
      setWithdrawAccountNumber('');
      setWithdrawAccountName('');
      Alert.alert('Thành công', 'Đã gửi yêu cầu rút tiền, chờ Quản lý dịch vụ duyệt.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ví của tôi</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={onRefresh} />}
      >
        {state.loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : state.error ? (
          <Text style={styles.errorText}>{state.error}</Text>
        ) : summary ? (
          <>
            <LinearGradient colors={[colors.primaryStrong, colors.primary]} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroLabel}>Số dư ví</Text>
                <View
                  style={[
                    styles.eligibilityBadge,
                    { backgroundColor: summary.eligibleForJobs ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.25)' },
                  ]}
                >
                  <Text style={[styles.eligibilityText, { color: summary.eligibleForJobs ? '#A7F3D0' : '#FECACA' }]}>
                    {summary.eligibleForJobs ? 'Đủ điều kiện nhận việc' : 'Dưới mức ký quỹ'}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroBalance}>{formatVND(summary.balance)}</Text>
              <Text style={styles.heroSub}>Mức tối thiểu để nhận việc: {formatVND(summary.minimumBalance)}</Text>
              <View style={styles.heroActions}>
                <TouchableOpacity style={styles.heroBtn} onPress={() => setTopUpVisible(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.heroBtnText}>Nạp tiền</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.heroBtn, (summary.withdrawableBalance <= 0 || hasPendingWithdrawal) && styles.heroBtnDisabled]}
                  disabled={summary.withdrawableBalance <= 0 || hasPendingWithdrawal}
                  onPress={() => setWithdrawVisible(true)}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.heroBtnText}>Rút tiền</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {!summary.eligibleForJobs && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={18} color={colors.warning} />
                <Text style={styles.warningText}>
                  Số dư dưới mức tối thiểu, bạn sẽ không nhận được việc mới. Hãy nạp thêm tiền vào ví.
                </Text>
              </View>
            )}
            {summary.balance < 0 && (
              <View style={styles.criticalBanner}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.criticalText}>
                  Ví đang âm (công nợ với nền tảng từ đơn tiền mặt). Vui lòng nạp tiền để thanh toán công nợ.
                </Text>
              </View>
            )}
            {state.topUpPending && (
              <View style={styles.infoBanner}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.infoText}>Đang chờ xác nhận thanh toán VNPay. Mở lại app để cập nhật số dư.</Text>
              </View>
            )}

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Có thể rút</Text>
                <Text style={styles.statValue}>{formatVND(summary.withdrawableBalance)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Giữ tối thiểu</Text>
                <Text style={styles.statValue}>{formatVND(summary.minimumBalance)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Đang chờ rút</Text>
                <Text style={styles.statValue}>{formatVND(summary.pendingWithdrawal)}</Text>
              </View>
            </View>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'transactions' && styles.tabBtnActive]}
                onPress={() => setActiveTab('transactions')}
              >
                <Text style={[styles.tabText, activeTab === 'transactions' && styles.tabTextActive]}>
                  Biến động số dư
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'withdrawals' && styles.tabBtnActive]}
                onPress={() => setActiveTab('withdrawals')}
              >
                <Text style={[styles.tabText, activeTab === 'withdrawals' && styles.tabTextActive]}>
                  Lịch sử rút tiền
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'transactions' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                  {TX_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.value}
                      style={[styles.filterChip, state.txFilter === f.value && styles.filterChipActive]}
                      onPress={() => controllerRef.current?.setTxFilter(f.value)}
                    >
                      <Text style={[styles.filterChipText, state.txFilter === f.value && styles.filterChipTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {state.transactionsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
                ) : state.transactions.length === 0 ? (
                  <Text style={styles.emptyText}>Chưa có giao dịch nào.</Text>
                ) : (
                  state.transactions.map((tx: WalletTransaction) => {
                    const isCredit = tx.balanceAfter >= tx.balanceBefore;
                    return (
                      <View key={tx.id} style={styles.txRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txTitle}>{TX_TYPE_LABELS[tx.type]}</Text>
                          {!!tx.description && <Text style={styles.txDesc}>{tx.description}</Text>}
                          <Text style={styles.txDate}>{formatDateTime(tx.createdAt)}</Text>
                        </View>
                        <Text style={[styles.txAmount, { color: isCredit ? colors.success : colors.error }]}>
                          {isCredit ? '+' : '-'}{formatVND(tx.amount)}
                        </Text>
                      </View>
                    );
                  })
                )}
                {state.transactionsTotal > 15 && (
                  <View style={styles.pagerRow}>
                    <TouchableOpacity
                      disabled={state.transactionsPage <= 1}
                      onPress={() => controllerRef.current?.loadTransactions(state.transactionsPage - 1)}
                      style={styles.pagerBtn}
                    >
                      <Text style={[styles.pagerText, state.transactionsPage <= 1 && styles.pagerTextDisabled]}>Trước</Text>
                    </TouchableOpacity>
                    <Text style={styles.pagerLabel}>Trang {state.transactionsPage}</Text>
                    <TouchableOpacity
                      disabled={state.transactionsPage * 15 >= state.transactionsTotal}
                      onPress={() => controllerRef.current?.loadTransactions(state.transactionsPage + 1)}
                      style={styles.pagerBtn}
                    >
                      <Text
                        style={[
                          styles.pagerText,
                          state.transactionsPage * 15 >= state.transactionsTotal && styles.pagerTextDisabled,
                        ]}
                      >
                        Sau
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : state.withdrawalsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
            ) : state.withdrawals.length === 0 ? (
              <Text style={styles.emptyText}>Chưa có yêu cầu rút tiền nào.</Text>
            ) : (
              state.withdrawals.map((w: WithdrawalRequest) => (
                <View key={w.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle}>{w.bankName} · {w.bankAccountNumber}</Text>
                    <Text style={styles.txDesc}>{w.bankAccountName}</Text>
                    <Text style={styles.txDate}>{formatDateTime(w.requestedAt)}</Text>
                    {w.status === 'REJECTED' && !!w.rejectReason && (
                      <Text style={styles.rejectReason}>Lý do từ chối: {w.rejectReason}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.txAmount}>{formatVND(w.amount)}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor:
                            w.status === 'SUCCESS' ? '#DCFCE7' : w.status === 'PENDING' ? '#FEF3C7' : '#FEE2E2',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          { color: w.status === 'SUCCESS' ? colors.success : w.status === 'PENDING' ? colors.warning : colors.error },
                        ]}
                      >
                        {WITHDRAWAL_STATUS_LABELS[w.status]}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Nạp tiền */}
      <Modal visible={topUpVisible} transparent animationType="fade" onRequestClose={() => setTopUpVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nạp tiền vào ví</Text>
            <View style={styles.presetRow}>
              {TOP_UP_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetChip, topUpAmount === String(p) && styles.presetChipActive]}
                  onPress={() => setTopUpAmount(String(p))}
                >
                  <Text style={[styles.presetChipText, topUpAmount === String(p) && styles.presetChipTextActive]}>
                    {p.toLocaleString('vi-VN')}đ
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={topUpAmount}
              onChangeText={setTopUpAmount}
              keyboardType="numeric"
              placeholder={`Số tiền khác (tối thiểu ${MIN_TOP_UP.toLocaleString('vi-VN')}đ)`}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {!!state.topUpError && <Text style={styles.modalError}>{state.topUpError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setTopUpVisible(false); setTopUpAmount(''); }}
                disabled={state.topUpBusy}
              >
                <Text style={styles.cancelBtnText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, state.topUpBusy && { opacity: 0.7 }]}
                onPress={submitTopUp}
                disabled={state.topUpBusy}
              >
                {state.topUpBusy ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.saveBtnText}>Nạp tiền</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rút tiền */}
      <Modal visible={withdrawVisible} transparent animationType="fade" onRequestClose={() => setWithdrawVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rút tiền về ngân hàng</Text>
            <Text style={styles.fieldLabel}>
              Có thể rút: {formatVND(summary?.withdrawableBalance ?? 0)}
            </Text>
            <TextInput
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              placeholder={`Số tiền (tối thiểu ${MIN_WITHDRAWAL.toLocaleString('vi-VN')}đ)`}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {BANKS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.presetChip, withdrawBank === b && styles.presetChipActive]}
                  onPress={() => setWithdrawBank(b)}
                >
                  <Text style={[styles.presetChipText, withdrawBank === b && styles.presetChipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              value={withdrawAccountNumber}
              onChangeText={setWithdrawAccountNumber}
              keyboardType="number-pad"
              placeholder="Số tài khoản"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={withdrawAccountName}
              onChangeText={(v) => setWithdrawAccountName(v.toUpperCase())}
              autoCapitalize="characters"
              placeholder="Chủ tài khoản (VIẾT HOA KHÔNG DẤU)"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {!!state.withdrawError && <Text style={styles.modalError}>{state.withdrawError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setWithdrawVisible(false)}
                disabled={state.withdrawBusy}
              >
                <Text style={styles.cancelBtnText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, state.withdrawBusy && { opacity: 0.7 }]}
                onPress={submitWithdraw}
                disabled={state.withdrawBusy}
              >
                {state.withdrawBusy ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.saveBtnText}>Gửi yêu cầu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  errorText: { color: colors.error, textAlign: 'center', marginTop: 40 },

  heroCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  eligibilityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  eligibilityText: { fontSize: 11, fontWeight: '700' },
  heroBalance: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 4 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 16 },
  heroActions: { flexDirection: 'row', gap: 10 },
  heroBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10 },
  heroBtnDisabled: { opacity: 0.5 },
  heroBtnText: { color: colors.primaryStrong, fontWeight: '700', fontSize: 13 },

  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12 },
  warningText: { flex: 1, color: '#92400E', fontSize: 12, fontWeight: '500' },
  criticalBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 12 },
  criticalText: { flex: 1, color: '#991B1B', fontSize: 12, fontWeight: '500' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryTint, borderRadius: 12, padding: 12, marginBottom: 12 },
  infoText: { flex: 1, color: colors.primaryStrong, fontSize: 12, fontWeight: '500' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: '700', color: colors.text },

  tabRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: colors.primaryTint },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primaryStrong },

  filterRow: { marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: colors.surface },

  emptyText: { textAlign: 'center', color: colors.muted, marginTop: 20 },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 10 },
  txTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  txDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  txDate: { fontSize: 11, color: colors.muted, marginTop: 4 },
  txAmount: { fontSize: 14, fontWeight: '800' },
  rejectReason: { fontSize: 11, color: colors.error, marginTop: 4 },

  statusPill: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  pagerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, marginTop: 8 },
  pagerBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  pagerText: { color: colors.primaryStrong, fontWeight: '700', fontSize: 13 },
  pagerTextDisabled: { color: colors.muted },
  pagerLabel: { color: colors.textSecondary, fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 8, fontWeight: '500' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  presetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetChipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  presetChipTextActive: { color: colors.surface },
  input: { width: '100%', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  modalError: { color: colors.error, fontSize: 12, marginBottom: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.border },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14 },
});
