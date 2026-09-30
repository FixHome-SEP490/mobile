import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  Landmark,
  Plus,
  type LucideIcon,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store';
import { walletApi } from '../../api/wallet.api';
import { useAppTheme, type Tone } from '../../constants/theme';
import StatusBadge from '../../components/StatusBadge';
import type { StatusView } from './technician-status';
import { formatDateTime, formatVnd } from '../../utils/format';
import type { RootStackParamList } from '../../types';
import type { WalletTransaction, WalletTxType, WithdrawalRequest } from '../../types/wallet.types';
import {
  MIN_TOP_UP,
  createWalletController,
  initialWalletState,
  minimumWithdrawalOf,
  openWithdrawalOf,
  type WalletUiState,
} from './technician-wallet';

const TOP_UP_PRESETS = [100_000, 200_000, 500_000, 1_000_000];

const TX_FILTERS: { value: WalletTxType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ONLINE_EARNING', label: 'Thu nhập' },
  { value: 'PLATFORM_FEE', label: 'Phí nền tảng' },
  { value: 'TOP_UP', label: 'Nạp tiền' },
  { value: 'WITHDRAW', label: 'Rút tiền' },
  { value: 'WITHDRAW_REFUND', label: 'Hoàn tiền rút' },
  { value: 'ADJUSTMENT', label: 'Điều chỉnh' },
];

const TX_TYPE_LABELS: Record<WalletTxType, string> = {
  TOP_UP: 'Nạp tiền',
  WITHDRAW: 'Rút tiền',
  WITHDRAW_REFUND: 'Hoàn tiền rút không thành công',
  ONLINE_EARNING: 'Thu nhập đơn online',
  PLATFORM_FEE: 'Phí nền tảng (đơn tiền mặt)',
  ADJUSTMENT: 'Điều chỉnh bởi Admin',
};

// Same words as the web technician wallet, so one person on two devices reads
// the same status.
const WITHDRAWAL_STATUS_VIEW: Record<WithdrawalRequest['status'], StatusView> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning', icon: 'Clock' },
  PROCESSING: { label: 'Đang chuyển tiền', tone: 'info', icon: 'Clock' },
  SUCCESS: { label: 'Đã chi tiền', tone: 'success', icon: 'CheckCircle2' },
  REJECTED: { label: 'Đã từ chối', tone: 'danger', icon: 'XCircle' },
  FAILED: { label: 'Chuyển thất bại', tone: 'danger', icon: 'AlertTriangle' },
};

/** Only the last four digits are shown outside the edit form. */
function maskAccountNumber(number: string): string {
  return number.length > 4 ? `•••• ${number.slice(-4)}` : number;
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
        getBankAccount: () => walletApi.getMyBankAccount(),
        listBanks: () => walletApi.listBanks(),
        saveBankAccount: (dto) => walletApi.saveMyBankAccount(dto),
        requestWithdrawal: (amount) => walletApi.requestWithdrawal(amount),
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

  const [bankVisible, setBankVisible] = useState(false);
  /** Set when the account form was opened on the way to withdrawing. */
  const [bankForWithdraw, setBankForWithdraw] = useState(false);
  const [bankBin, setBankBin] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  /** The list is only open while choosing; once a bank is picked it folds away. */
  const [bankListOpen, setBankListOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const summary = state.summary;
  const openWithdrawal = openWithdrawalOf(state);
  const minimumWithdrawal = minimumWithdrawalOf(summary);
  const canWithdraw =
    !!summary && !openWithdrawal && summary.withdrawableBalance >= minimumWithdrawal;

  const selectedBank = state.banks.find((b) => b.bin === bankBin) ?? null;
  const visibleBanks = useMemo(() => {
    const query = bankSearch.trim().toLowerCase();
    if (!query) return state.banks;
    return state.banks.filter(
      (b) =>
        b.shortName.toLowerCase().includes(query) ||
        b.code.toLowerCase().includes(query) ||
        b.name.toLowerCase().includes(query),
    );
  }, [bankSearch, state.banks]);

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

  const openBankForm = (forWithdraw: boolean) => {
    setBankForWithdraw(forWithdraw);
    setBankBin(state.bankAccount?.bankBin ?? '');
    setAccountNumber(state.bankAccount?.accountNumber ?? '');
    setAccountName(state.bankAccount?.accountName ?? '');
    setBankSearch('');
    // Nothing chosen yet: start with the list open. Editing a saved account:
    // start folded on the bank already chosen.
    setBankListOpen(!state.bankAccount?.bankBin);
    setBankVisible(true);
    void controllerRef.current?.loadBanks();
  };

  const chooseBank = (bin: string) => {
    setBankBin(bin);
    setBankSearch('');
    setBankListOpen(false);
  };

  const openWithdraw = () => {
    if (!canWithdraw) return;
    if (!state.bankAccount) {
      openBankForm(true);
      return;
    }
    setWithdrawAmount('');
    setWithdrawVisible(true);
  };

  const submitBank = async () => {
    const ok = await controllerRef.current?.submitBankAccount({
      bankBin,
      accountNumber,
      accountName,
    });
    if (!ok) return;
    setBankVisible(false);
    // They came here on the way to withdrawing: carry on to where they meant to go.
    if (bankForWithdraw) {
      setWithdrawAmount('');
      setWithdrawVisible(true);
    }
  };

  const submitWithdraw = async () => {
    const ok = await controllerRef.current?.submitWithdrawal(
      Number(withdrawAmount.replace(/\D/g, '')) || 0,
    );
    if (ok) {
      setWithdrawVisible(false);
      setWithdrawAmount('');
      Alert.alert(
        'Đã gửi yêu cầu',
        'Quản lý dịch vụ duyệt xong, hệ thống tự chuyển khoản về tài khoản của bạn.',
      );
    }
  };

  const balanceNegative = !!summary && summary.balance < 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Ví của tôi</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={onRefresh} />}
      >
        {state.loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={colors.primaryStrong} />
            <Text style={styles.mutedText}>Đang tải…</Text>
          </View>
        ) : state.error ? (
          <View style={styles.centerBlock}>
            <AlertTriangle size={40} color={colors.error} strokeWidth={1.5} />
            <Text style={styles.errorText}>{state.error}</Text>
            <TouchableOpacity style={styles.textBtn} onPress={onRefresh} accessibilityRole="button">
              <Text style={styles.textBtnLabel}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : summary ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.caption}>Số dư ví</Text>
              <Text style={[styles.heroBalance, balanceNegative && { color: colors.error }]}>
                {formatVnd(summary.balance)}
              </Text>
              <StatusBadge
                view={
                  summary.eligibleForJobs
                    ? { label: 'Đủ điều kiện nhận việc', tone: 'success', icon: 'CheckCircle2' }
                    : { label: 'Dưới mức ký quỹ', tone: 'danger', icon: 'AlertTriangle' }
                }
              />
              <Text style={styles.bodySmall}>Mức tối thiểu để nhận việc: {formatVnd(summary.minimumBalance)}</Text>
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.flex1]}
                  onPress={() => setTopUpVisible(true)}
                  accessibilityRole="button"
                >
                  <Plus size={18} color={colors.surface} strokeWidth={2} />
                  <Text style={styles.primaryBtnText}>Nạp tiền</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryBtn, styles.flex1, !canWithdraw && styles.disabled]}
                  disabled={!canWithdraw}
                  onPress={openWithdraw}
                  accessibilityRole="button"
                  accessibilityLabel="Rút tiền"
                  accessibilityState={{ disabled: !canWithdraw }}
                >
                  <ArrowDownToLine size={18} color={colors.primaryStrong} strokeWidth={2} />
                  <Text style={styles.secondaryBtnText}>Rút tiền</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!summary.eligibleForJobs && !balanceNegative && (
              <Banner
                styles={styles}
                tone={colors.tone.warning}
                Icon={AlertTriangle}
                text="Số dư dưới mức tối thiểu, bạn sẽ không nhận được việc mới. Hãy nạp thêm tiền vào ví."
              />
            )}
            {balanceNegative && (
              <Banner
                styles={styles}
                tone={colors.tone.danger}
                Icon={AlertCircle}
                text="Ví đang âm (công nợ với nền tảng từ đơn tiền mặt). Vui lòng nạp tiền để thanh toán công nợ."
              />
            )}
            {state.topUpPending && (
              <Banner
                styles={styles}
                tone={colors.tone.info}
                busy
                text="Đang chờ xác nhận thanh toán VNPay. Mở lại ứng dụng để cập nhật số dư."
              />
            )}
            {openWithdrawal === 'PROCESSING' && (
              <Banner
                styles={styles}
                tone={colors.tone.info}
                busy
                text="Lệnh rút đã được duyệt, hệ thống đang chuyển khoản về ngân hàng của bạn."
              />
            )}

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.caption}>Có thể rút</Text>
                <Text style={styles.statValue}>{formatVnd(summary.withdrawableBalance)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.caption}>Giữ tối thiểu</Text>
                <Text style={styles.statValue}>{formatVnd(summary.minimumBalance)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.caption}>
                  {openWithdrawal === 'PROCESSING' ? 'Đang chuyển' : 'Đang chờ rút'}
                </Text>
                <Text style={styles.statValue}>
                  {formatVnd(summary.pendingWithdrawal + (summary.processingWithdrawal ?? 0))}
                </Text>
              </View>
            </View>

            {/* Receiving bank account */}
            <View style={styles.bankCard}>
              <View style={styles.iconTile}>
                <Landmark size={20} color={colors.primaryStrong} strokeWidth={1.75} />
              </View>
              <View style={styles.flex1}>
                {state.bankAccount ? (
                  <>
                    <Text style={styles.caption}>Tài khoản nhận tiền rút</Text>
                    <Text style={styles.rowTitle}>
                      {state.bankAccount.bankName} · {maskAccountNumber(state.bankAccount.accountNumber)}
                    </Text>
                    <Text style={styles.bodySmall}>{state.bankAccount.accountName}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.rowTitle}>Chưa khai báo tài khoản nhận tiền</Text>
                    <Text style={styles.bodySmall}>Tên chủ tài khoản phải trùng tên đã xác minh danh tính.</Text>
                  </>
                )}
              </View>
              <TouchableOpacity
                style={styles.textBtn}
                onPress={() => openBankForm(false)}
                accessibilityRole="button"
                accessibilityLabel={state.bankAccount ? 'Đổi tài khoản nhận tiền' : 'Khai báo tài khoản nhận tiền'}
              >
                <Text style={styles.textBtnLabel}>{state.bankAccount ? 'Đổi' : 'Khai báo'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.segment}>
              {(['transactions', 'withdrawals'] as const).map((tab) => {
                const active = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    onPress={() => setActiveTab(tab)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {tab === 'transactions' ? 'Biến động số dư' : 'Lịch sử rút tiền'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === 'transactions' ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterScroll}
                  contentContainerStyle={styles.filterRow}
                >
                  {TX_FILTERS.map((f) => {
                    const active = state.txFilter === f.value;
                    return (
                      <TouchableOpacity
                        key={f.value}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                        onPress={() => controllerRef.current?.setTxFilter(f.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {state.transactionsLoading ? (
                  <ActivityIndicator color={colors.primaryStrong} style={styles.listSpinner} />
                ) : state.transactions.length === 0 ? (
                  <Text style={styles.emptyText}>Chưa có giao dịch nào.</Text>
                ) : (
                  state.transactions.map((tx: WalletTransaction) => {
                    const isCredit = tx.balanceAfter >= tx.balanceBefore;
                    return (
                      <View key={tx.id} style={styles.txRow}>
                        <View style={styles.flex1}>
                          <Text style={styles.rowTitle}>{TX_TYPE_LABELS[tx.type] ?? tx.type}</Text>
                          {!!tx.description && <Text style={styles.bodySmall}>{tx.description}</Text>}
                          <Text style={styles.caption}>{formatDateTime(tx.createdAt)}</Text>
                        </View>
                        <Text
                          style={[styles.txAmount, { color: isCredit ? colors.tone.success.text : colors.error }]}
                          accessibilityLabel={`${isCredit ? 'Cộng' : 'Trừ'} ${formatVnd(tx.amount)}`}
                        >
                          {isCredit ? '+' : '-'}{formatVnd(tx.amount)}
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
                      style={styles.textBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Trang trước"
                    >
                      <Text style={[styles.textBtnLabel, state.transactionsPage <= 1 && styles.pagerTextDisabled]}>Trước</Text>
                    </TouchableOpacity>
                    <Text style={styles.bodySmall}>Trang {state.transactionsPage}</Text>
                    <TouchableOpacity
                      disabled={state.transactionsPage * 15 >= state.transactionsTotal}
                      onPress={() => controllerRef.current?.loadTransactions(state.transactionsPage + 1)}
                      style={styles.textBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Trang sau"
                    >
                      <Text
                        style={[
                          styles.textBtnLabel,
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
              <ActivityIndicator color={colors.primaryStrong} style={styles.listSpinner} />
            ) : state.withdrawals.length === 0 ? (
              <Text style={styles.emptyText}>Chưa có yêu cầu rút tiền nào.</Text>
            ) : (
              state.withdrawals.map((w: WithdrawalRequest) => (
                <View key={w.id} style={styles.txRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>{w.bankName} · {w.bankAccountNumber}</Text>
                    <Text style={styles.bodySmall}>{w.bankAccountName}</Text>
                    <Text style={styles.caption}>{formatDateTime(w.requestedAt)}</Text>
                    {w.status === 'REJECTED' && !!w.rejectReason && (
                      <Text style={styles.reasonText}>Lý do từ chối: {w.rejectReason}</Text>
                    )}
                    {w.status === 'FAILED' && (
                      <Text style={styles.reasonText}>
                        Không chuyển được{w.failureReason ? `: ${w.failureReason}` : ''}. Tiền đã được hoàn lại vào ví.
                      </Text>
                    )}
                    {w.status === 'SUCCESS' && !!w.payoutBankReference && (
                      <Text style={styles.bodySmall}>Mã giao dịch ngân hàng: {w.payoutBankReference}</Text>
                    )}
                    {w.status === 'PROCESSING' && (
                      <Text style={styles.bodySmall}>Đã duyệt, đang chuyển về ngân hàng.</Text>
                    )}
                  </View>
                  <View style={styles.amountCol}>
                    <Text style={styles.txAmount}>{formatVnd(w.amount)}</Text>
                    <StatusBadge
                      view={
                        WITHDRAWAL_STATUS_VIEW[w.status] ?? {
                          label: 'Trạng thái chưa xác định',
                          tone: 'neutral',
                          icon: 'HelpCircle',
                        }
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Nạp tiền */}
      <FormModal
        styles={styles}
        visible={topUpVisible}
        title="Nạp tiền vào ví"
        onClose={() => { setTopUpVisible(false); setTopUpAmount(''); }}
      >
        <View style={styles.presetRow}>
          {TOP_UP_PRESETS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.presetChip, topUpAmount === String(p) && styles.presetChipActive]}
              onPress={() => setTopUpAmount(String(p))}
              accessibilityRole="button"
              accessibilityState={{ selected: topUpAmount === String(p) }}
            >
              <Text style={[styles.presetChipText, topUpAmount === String(p) && styles.presetChipTextActive]}>
                {formatVnd(p)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Số tiền khác</Text>
        <TextInput
          value={topUpAmount}
          onChangeText={setTopUpAmount}
          keyboardType="numeric"
          placeholder={`Tối thiểu ${formatVnd(MIN_TOP_UP)}`}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Số tiền nạp"
          style={styles.input}
        />
        {!!state.topUpError && <Text style={styles.modalError} accessibilityRole="alert">{state.topUpError}</Text>}
        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flex1]}
            onPress={() => { setTopUpVisible(false); setTopUpAmount(''); }}
            disabled={state.topUpBusy}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.flex1, state.topUpBusy && styles.disabled]}
            onPress={submitTopUp}
            disabled={state.topUpBusy}
            accessibilityRole="button"
          >
            {state.topUpBusy ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.primaryBtnText}>Nạp tiền</Text>
            )}
          </TouchableOpacity>
        </View>
      </FormModal>

      {/* Rút tiền */}
      <FormModal
        styles={styles}
        visible={withdrawVisible}
        title="Rút tiền về ngân hàng"
        onClose={() => setWithdrawVisible(false)}
      >
        <Text style={styles.bodySmall}>Có thể rút: {formatVnd(summary?.withdrawableBalance ?? 0)}</Text>
        <Text style={styles.fieldLabel}>Số tiền rút</Text>
        <TextInput
          value={withdrawAmount}
          onChangeText={setWithdrawAmount}
          keyboardType="numeric"
          placeholder={`Tối thiểu ${formatVnd(minimumWithdrawal)}`}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Số tiền rút"
          style={styles.input}
        />
        {state.bankAccount && (
          <View style={styles.destinationBox}>
            <View style={styles.flex1}>
              <Text style={styles.caption}>Chuyển về tài khoản</Text>
              <Text style={styles.rowTitle}>
                {state.bankAccount.bankName} · {state.bankAccount.accountNumber}
              </Text>
              <Text style={styles.bodySmall}>{state.bankAccount.accountName}</Text>
            </View>
            <TouchableOpacity
              style={styles.textBtn}
              onPress={() => { setWithdrawVisible(false); openBankForm(false); }}
              accessibilityRole="button"
              accessibilityLabel="Đổi tài khoản nhận tiền"
            >
              <Text style={styles.textBtnLabel}>Đổi</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.hintText}>
          Quản lý dịch vụ duyệt xong, hệ thống tự chuyển khoản. Nếu chuyển không thành công, tiền được hoàn lại vào ví.
        </Text>
        {!!state.withdrawError && <Text style={styles.modalError} accessibilityRole="alert">{state.withdrawError}</Text>}
        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flex1]}
            onPress={() => setWithdrawVisible(false)}
            disabled={state.withdrawBusy}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.flex1, state.withdrawBusy && styles.disabled]}
            onPress={submitWithdraw}
            disabled={state.withdrawBusy}
            accessibilityRole="button"
          >
            {state.withdrawBusy ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.primaryBtnText}>Gửi yêu cầu</Text>
            )}
          </TouchableOpacity>
        </View>
      </FormModal>

      {/* Tài khoản nhận tiền */}
      <FormModal
        styles={styles}
        visible={bankVisible}
        title="Tài khoản nhận tiền rút"
        onClose={() => setBankVisible(false)}
      >
        {bankForWithdraw && (
          <Text style={styles.hintText}>
            Bạn cần khai báo tài khoản nhận tiền trước khi rút. Khai một lần, lần sau hệ thống điền sẵn.
          </Text>
        )}

        <Text style={styles.fieldLabel}>Ngân hàng</Text>
        {bankListOpen || !selectedBank ? (
          <>
            <TextInput
              value={bankSearch}
              onChangeText={setBankSearch}
              placeholder="Tìm ngân hàng (VD: Vietcombank, MB)"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Tìm ngân hàng"
              style={styles.input}
            />
            <ScrollView style={styles.bankList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {state.banks.length === 0 ? (
                <ActivityIndicator color={colors.primaryStrong} style={styles.listSpinner} />
              ) : visibleBanks.length === 0 ? (
                <Text style={[styles.bodySmall, styles.pad12]}>Không tìm thấy ngân hàng phù hợp.</Text>
              ) : (
                visibleBanks.map((b) => (
                  <TouchableOpacity
                    key={b.bin}
                    style={[styles.bankOption, bankBin === b.bin && styles.bankOptionActive]}
                    onPress={() => chooseBank(b.bin)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: bankBin === b.bin }}
                  >
                    <Text style={[styles.rowTitle, bankBin === b.bin && { color: colors.primaryStrong }]}>
                      {b.shortName}
                    </Text>
                    <Text style={styles.bodySmall} numberOfLines={1}>{b.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </>
        ) : (
          // Chosen: one row with the bank and a way back into the list.
          <TouchableOpacity
            style={styles.selectedBank}
            onPress={() => setBankListOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Ngân hàng đã chọn: ${selectedBank.shortName}. Bấm để đổi`}
          >
            <View style={styles.flex1}>
              <Text style={styles.rowTitle}>{selectedBank.shortName}</Text>
              <Text style={styles.bodySmall} numberOfLines={1}>{selectedBank.name}</Text>
            </View>
            <Text style={styles.textBtnLabel}>Đổi</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.fieldLabel}>Số tài khoản</Text>
        <TextInput
          value={accountNumber}
          onChangeText={setAccountNumber}
          keyboardType="number-pad"
          maxLength={19}
          placeholder="Nhập số tài khoản"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Số tài khoản"
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Tên chủ tài khoản</Text>
        <TextInput
          value={accountName}
          onChangeText={setAccountName}
          autoCapitalize="characters"
          maxLength={128}
          placeholder="Nhập tên chủ tài khoản"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Tên chủ tài khoản"
          style={styles.input}
        />
        <Text style={styles.hintText}>
          Phải trùng họ tên đã xác minh danh tính. Gõ có dấu hay không dấu đều được.
        </Text>
        {!!state.bankError && <Text style={styles.modalError} accessibilityRole="alert">{state.bankError}</Text>}
        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flex1]}
            onPress={() => setBankVisible(false)}
            disabled={state.bankBusy}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.flex1, state.bankBusy && styles.disabled]}
            onPress={submitBank}
            disabled={state.bankBusy}
            accessibilityRole="button"
          >
            {state.bankBusy ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.primaryBtnText}>Lưu tài khoản</Text>
            )}
          </TouchableOpacity>
        </View>
      </FormModal>
    </SafeAreaView>
  );
}

type WalletStyles = ReturnType<typeof getStyles>;

function Banner({ styles, tone, Icon, busy, text }: {
  styles: WalletStyles;
  tone: Tone;
  Icon?: LucideIcon;
  busy?: boolean;
  text: string;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg }]} accessibilityRole="alert">
      {busy ? <ActivityIndicator size="small" color={tone.fg} /> : Icon ? <Icon size={18} color={tone.fg} strokeWidth={1.75} /> : null}
      <Text style={[styles.bannerText, { color: tone.text }]}>{text}</Text>
    </View>
  );
}

/** Centered dialog that keeps its fields above the keyboard and scrolls when content is tall. */
function FormModal({ styles, visible, title, onClose, children }: {
  styles: WalletStyles;
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle} accessibilityRole="header">{title}</Text>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  pad12: { padding: 12 },
  disabled: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  centerBlock: { alignItems: 'center', gap: 12, marginTop: 40 },
  mutedText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.error, textAlign: 'center' },

  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  bodySmall: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  hintText: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, marginBottom: 12 },

  heroCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  heroBalance: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.text },
  heroActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, paddingHorizontal: 16 },
  primaryBtnText: { color: colors.surface, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primaryStrong, backgroundColor: colors.surface, paddingHorizontal: 16 },
  secondaryBtnText: { color: colors.primaryStrong, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  textBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  textBtnLabel: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '700' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12 },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },

  statRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 4 },
  statValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },

  bankCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  iconTile: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  bankList: { maxHeight: 200, borderWidth: 1, borderColor: colors.border, borderRadius: 14, marginBottom: 12 },
  selectedBank: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, borderWidth: 1, borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 },
  bankOption: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  bankOptionActive: { backgroundColor: colors.primarySoft },
  destinationBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12 },

  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.border },
  segmentBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  segmentBtnActive: { backgroundColor: colors.primarySoft },
  segmentText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
  segmentTextActive: { color: colors.primaryStrong, fontWeight: '700' },

  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8 },
  filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  filterChipText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, fontWeight: '500' },
  filterChipTextActive: { color: colors.surface, fontWeight: '700' },

  listSpinner: { marginVertical: 16 },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 16 },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 12 },
  txAmount: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  amountCol: { alignItems: 'flex-end', gap: 6 },
  reasonText: { fontSize: 12, lineHeight: 16, color: colors.error, marginTop: 4 },

  pagerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  pagerTextDisabled: { color: colors.muted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 14, lineHeight: 20, color: colors.text, marginBottom: 8, fontWeight: '500' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  presetChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  presetChipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  presetChipText: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '600' },
  presetChipTextActive: { color: colors.surface },
  input: { width: '100%', minHeight: 48, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text, marginBottom: 12 },
  modalError: { color: colors.error, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
