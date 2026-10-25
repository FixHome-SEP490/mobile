import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, CheckCircle2, Clock3, Landmark } from 'lucide-react-native';
import BackButton from '../../components/BackButton';
import { customerWithdrawalApi } from '../../api/customer-withdrawal.api';
import type {
  CustomerBankAccount,
  CustomerBankOption,
  CustomerWithdrawal,
  CustomerWithdrawalHistory,
  CustomerWithdrawalInfo,
} from '../../api/customer-withdrawal.api';
import { useAuthStore } from '../../store/auth.store';
import type { RootStackParamList } from '../../types';
import { fontSize, lightTheme as colors, spacing } from '../../constants/theme';
import { formatVnd } from '../../utils/format';
import { vnDateTimeString } from '../../utils/vn-time';
import { wholeVnd } from '../../api/customer-wallet.api';
import { parseWholeVndInput } from '../order-flow/shared/m6-amount-input';
import { findNewCustomerWithdrawal } from './customer-withdrawal.workflow';

const PAGE_LIMIT = 20;
type PreparedWithdrawal = {
  amount: number;
  owner: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
};

function withdrawalState(status: CustomerWithdrawal['status']) {
  if (status === 'PROCESSING') return { title: 'Đang xử lý', detail: 'Ngân hàng đang xử lý lệnh. Không tạo lệnh khác khi giao dịch còn đang xử lý.', tone: 'warning' as const };
  if (status === 'SUCCESS') return { title: 'Thành công', detail: 'Ngân hàng đã xác nhận giao dịch.', tone: 'success' as const };
  return { title: 'Thất bại', detail: 'Lệnh thất bại; tiền đã được hoàn về ví.', tone: 'danger' as const };
}

function matchesAccount(left: CustomerBankAccount | null, right: CustomerBankAccount | null): boolean {
  if (!left || !right) return left === right;
  return left.bankBin === right.bankBin && left.bankCode === right.bankCode
    && left.bankName === right.bankName && left.accountNumber === right.accountNumber
    && left.accountName === right.accountName;
}

function maskAccountNumber(value: string): string {
  return `••••${value.slice(-4)}`;
}

export default function CustomerWithdrawScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const userId = useAuthStore(state => state.user?.role === 'customer' ? state.user.id : null);
  const sessionGeneration = useAuthStore(state => state.sessionGeneration);
  const owner = `${userId ?? 'none'}/${sessionGeneration}`;
  const ownerRef = useRef(owner);
  const loadSeqRef = useRef(0);
  const historySeqRef = useRef(0);
  const postingRef = useRef(false);
  const unknownSnapshotRef = useRef<{ previousIds: string[]; amount: number } | null>(null);
  React.useEffect(() => { ownerRef.current = owner; }, [owner]);

  const [info, setInfo] = useState<CustomerWithdrawalInfo | null>(null);
  const [banks, setBanks] = useState<CustomerBankOption[]>([]);
  const [bankAccount, setBankAccount] = useState<CustomerBankAccount | null>(null);
  const [history, setHistory] = useState<CustomerWithdrawalHistory | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [showBanks, setShowBanks] = useState(false);
  const [selectedBank, setSelectedBank] = useState<CustomerBankOption | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [amountError, setAmountError] = useState('');
  const [message, setMessage] = useState('');
  const [prepared, setPrepared] = useState<PreparedWithdrawal | null>(null);
  const [latestWithdrawal, setLatestWithdrawal] = useState<CustomerWithdrawal | null>(null);
  const [posting, setPosting] = useState(false);
  const [unknownAck, setUnknownAck] = useState(false);
  const [checkingAck, setCheckingAck] = useState(false);

  const loadAll = useCallback(async () => {
    const sequence = ++loadSeqRef.current;
    if (!userId) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [nextInfo, nextBanks, nextAccount, nextHistory] = await Promise.all([
        customerWithdrawalApi.getInfo(),
        customerWithdrawalApi.getBanks(),
        customerWithdrawalApi.getBankAccount(),
        customerWithdrawalApi.getHistory({ page: 1, limit: PAGE_LIMIT }),
      ]);
      if (sequence !== loadSeqRef.current || ownerRef.current !== owner) return;
      if (nextInfo.hasBankAccount !== !!nextAccount || !matchesAccount(nextInfo.bankAccount, nextAccount)) {
        throw new Error('Tài khoản ngân hàng chưa đồng nhất trên máy chủ.');
      }
      const option = nextAccount ? nextBanks.find(bank => bank.bin === nextAccount.bankBin) ?? null : null;
      if (nextAccount && !option) throw new Error('Ngân hàng nhận tiền không còn trong danh sách hỗ trợ.');
      setInfo(nextInfo);
      setBanks(nextBanks);
      setBankAccount(nextAccount);
      setHistory(nextHistory);
      setPage(1);
      setSelectedBank(option);
      setBankSearch(option?.shortName ?? '');
      setAccountNumber(nextAccount?.accountNumber ?? '');
      setAccountName(nextAccount?.accountName ?? '');
      setEditingBank(!nextAccount && nextInfo.kycStatus === 'verified');
      setLoadError(false);
    } catch {
      if (sequence === loadSeqRef.current && ownerRef.current === owner) setLoadError(true);
    } finally {
      if (sequence === loadSeqRef.current && ownerRef.current === owner) setLoading(false);
    }
  }, [owner, userId]);

  useFocusEffect(useCallback(() => {
    void loadAll();
    return () => {
      loadSeqRef.current += 1;
      historySeqRef.current += 1;
      setPrepared(null);
      setAmountText('');
    };
  }, [loadAll]));

  const updateHistory = (next: CustomerWithdrawalHistory) => {
    setHistory(next);
    setPage(next.meta.page);
  };

  const loadPage = async (nextPage: number) => {
    if (nextPage < 1 || (history && nextPage > Math.max(1, history.meta.totalPages)) || loading) return;
    const sequence = ++historySeqRef.current;
    setMessage('');
    try {
      const next = await customerWithdrawalApi.getHistory({ page: nextPage, limit: PAGE_LIMIT });
      if (sequence !== historySeqRef.current || ownerRef.current !== owner) return;
      updateHistory(next);
    } catch {
      if (sequence === historySeqRef.current) setMessage('Chưa tải được trang lịch sử. Hãy thử lại.');
    }
  };

  const reconcileUnknown = async () => {
    const snapshot = unknownSnapshotRef.current;
    if (!snapshot || !userId || checkingAck) return;
    setCheckingAck(true);
    setMessage('Đang kiểm tra trạng thái lệnh trên máy chủ.');
    try {
      const [nextInfo, nextHistory] = await Promise.all([
        customerWithdrawalApi.getInfo(),
        customerWithdrawalApi.getHistory({ page: 1, limit: PAGE_LIMIT }),
      ]);
      if (ownerRef.current !== owner) return;
      if (nextInfo.hasBankAccount !== !!nextInfo.bankAccount) throw new Error('Inconsistent bank account state');
      setInfo(nextInfo);
      updateHistory(nextHistory);
      const match = findNewCustomerWithdrawal({
        history: nextHistory,
        info: nextInfo,
        previousIds: snapshot.previousIds,
        amount: snapshot.amount,
      });
      if (match) {
        setLatestWithdrawal(match);
        setUnknownAck(false);
        unknownSnapshotRef.current = null;
        setMessage(withdrawalState(match.status).title);
      } else {
        setUnknownAck(true);
        setMessage('Chưa xác định được kết quả. Không gửi lại lệnh; hãy kiểm tra trạng thái hoặc liên hệ FixHome.');
      }
    } catch {
      if (ownerRef.current === owner) {
        setUnknownAck(true);
        setMessage('Chưa tải được trạng thái. Không gửi lại lệnh; hãy kiểm tra lại sau.');
      }
    } finally {
      if (ownerRef.current === owner) setCheckingAck(false);
    }
  };

  const saveBank = async () => {
    if (savingBank || posting || unknownAck || !selectedBank) return;
    const dto = { bankBin: selectedBank.bin, accountNumber: accountNumber.trim(), accountName: accountName.trim() };
    if (!/^\d{6,19}$/.test(dto.accountNumber) || dto.accountName.length < 1 || dto.accountName.length > 128) {
      setMessage('Kiểm tra số tài khoản từ 6 đến 19 chữ số và tên chủ tài khoản.');
      return;
    }
    setSavingBank(true);
    setMessage('Đang lưu tài khoản nhận tiền.');
    setPrepared(null);
    try {
      await customerWithdrawalApi.saveBankAccount(dto);
      setEditingBank(false);
      setMessage('Đã lưu. Đang xác nhận lại thông tin tài khoản.');
      await loadAll();
    } catch {
      setMessage('Chưa lưu được tài khoản. Kiểm tra thông tin trùng với tên CCCD đã xác minh rồi thử lại.');
      try {
        const current = await customerWithdrawalApi.getBankAccount();
        setBankAccount(current);
      } catch {
        // Keep the form visible; a readback failure does not confirm a save.
      }
    } finally {
      setSavingBank(false);
    }
  };

  const prepareWithdrawal = () => {
    if (!info || !bankAccount || !info.canWithdraw || editingBank || unknownAck) return;
    const amount = parseWholeVndInput(amountText, { min: info.minimumAmount, max: info.maximumAmount });
    if (amount === null) {
      setAmountError(`Nhập số nguyên từ ${formatVnd(info.minimumAmount)} đến ${formatVnd(info.maximumAmount)}.`);
      setPrepared(null);
      return;
    }
    setAmountError('');
    setPrepared({
      amount, owner, bankBin: bankAccount.bankBin,
      accountNumber: bankAccount.accountNumber, accountName: bankAccount.accountName,
    });
    setMessage('Kiểm tra số tiền và tài khoản nhận trước khi xác nhận.');
  };

  const confirmWithdrawal = async () => {
    if (!prepared || postingRef.current || unknownAck || !info || !bankAccount) return;
    if (prepared.owner !== owner || prepared.bankBin !== bankAccount.bankBin
      || prepared.accountNumber !== bankAccount.accountNumber || prepared.accountName !== bankAccount.accountName
      || !info.canWithdraw || editingBank) {
      setPrepared(null);
      setMessage('Thông tin đã thay đổi. Kiểm tra lại trước khi tạo lệnh.');
      return;
    }
    postingRef.current = true;
    setPosting(true);
    setPrepared(null);
    setMessage('Đang gửi một lệnh rút tiền. Không đóng màn hình trong lúc gửi.');
    const previousIds = history?.data.map(item => item.id) ?? [];
    const snapshot = { previousIds, amount: prepared.amount };
    let result: CustomerWithdrawal;
    try {
      result = await customerWithdrawalApi.createWithdrawal(prepared.amount);
    } catch {
      unknownSnapshotRef.current = snapshot;
      setUnknownAck(true);
      setAmountText('');
      setMessage('Chưa nhận được xác nhận của máy chủ. Không gửi lại lệnh tự động. Đang kiểm tra trạng thái…');
      setPosting(false);
      postingRef.current = false;
      await reconcileUnknown();
      return;
    }
    if (ownerRef.current !== owner) {
      postingRef.current = false;
      return;
    }
    setLatestWithdrawal(result);
    setUnknownAck(false);
    unknownSnapshotRef.current = null;
    setAmountText('');
    setMessage(withdrawalState(result.status).title);
    setPosting(false);
    postingRef.current = false;
    try {
      const [nextInfo, nextHistory] = await Promise.all([
        customerWithdrawalApi.getInfo(),
        customerWithdrawalApi.getHistory({ page: 1, limit: PAGE_LIMIT }),
      ]);
      if (ownerRef.current !== owner) return;
      setInfo(nextInfo);
      updateHistory(nextHistory);
      const refreshed = nextHistory.data.find(item => item.id === result.id);
      if (refreshed) setLatestWithdrawal(refreshed);
    } catch {
      // The POST response remains authoritative for this screen; refresh is read-only.
    }
  };

  const visibleBanks = banks.filter(bank => {
    const query = bankSearch.trim().toLocaleLowerCase();
    return !query || `${bank.shortName} ${bank.name} ${bank.code} ${bank.bin}`.toLocaleLowerCase().includes(query);
  }).slice(0, 8);
  const historyPages = history ? Math.max(1, history.meta.totalPages) : 1;
  const canPrepare = !!info?.canWithdraw && !!bankAccount && !editingBank && !posting && !unknownAck;
  const effectiveOpenWithdrawal = info?.openWithdrawal;
  const latestCopy = latestWithdrawal ? withdrawalState(latestWithdrawal.status) : null;
  const LatestIcon = latestWithdrawal?.status === 'SUCCESS' ? CheckCircle2 : latestWithdrawal?.status === 'FAILED' ? AlertTriangle : Clock3;
  const kycProgress = info?.kycStatus === 'verified'
    ? { label: 'Đã xác minh', state: 'complete' as const }
    : info?.kycStatus === 'pending'
      ? { label: 'Đang chờ duyệt', state: 'current' as const }
      : info?.kycStatus === 'rejected'
        ? { label: 'Cần gửi lại', state: 'current' as const }
        : { label: 'Cần xác minh', state: 'current' as const };
  const bankProgress = !info || info.kycStatus !== 'verified'
    ? { label: 'Sau xác minh', state: 'locked' as const }
    : bankAccount
      ? { label: 'Đã liên kết', state: 'complete' as const }
      : { label: 'Cần liên kết', state: 'current' as const };
  const withdrawalProgress = !bankAccount
      ? { label: 'Sau khi liên kết', state: 'locked' as const }
      : !info || info.kycStatus !== 'verified'
        ? { label: 'Sau xác minh', state: 'locked' as const }
        : effectiveOpenWithdrawal
        ? { label: 'Đang xử lý', state: 'current' as const }
        : !info.payoutAvailable
          ? { label: 'Tạm thời chưa khả dụng', state: 'current' as const }
          : !info.canWithdraw
            ? { label: 'Chưa khả dụng', state: 'current' as const }
            : { label: 'Sẵn sàng', state: 'current' as const };
  const progressSteps = [
    { id: 'kyc', title: 'Xác minh', ...kycProgress },
    { id: 'bank', title: 'Ngân hàng', ...bankProgress },
    { id: 'withdrawal', title: 'Rút tiền', ...withdrawalProgress },
  ];
  const progressStepStyles = {
    complete: styles.progressStep_complete,
    current: styles.progressStep_current,
    locked: styles.progressStep_locked,
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <BackButton />
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Ví FixHome</Text>
            <Text style={styles.title} accessibilityRole="header">Rút tiền</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={styles.loading} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
              <ActivityIndicator color={colors.primaryStrong} />
              <Text style={styles.body}>Đang tải điều kiện rút tiền…</Text>
            </View>
          ) : loadError || !info || !history ? (
            <View style={styles.card}>
              <AlertTriangle color={colors.error} size={24} />
              <Text style={styles.cardTitle}>Chưa tải được thông tin rút tiền</Text>
              <Text style={styles.body}>Chưa xác định được trạng thái xác minh danh tính, tài khoản ngân hàng hoặc lịch sử. Thử tải lại trước khi tiếp tục.</Text>
              <ActionButton testID="withdrawal-reload" label="Tải lại" onPress={() => void loadAll()} />
            </View>
          ) : (
            <>
              <View style={styles.progress} testID="withdrawal-progress" accessibilityLabel="Tiến trình rút tiền: xác minh danh tính, liên kết ngân hàng, rút tiền">
                {progressSteps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    {index > 0 ? <View style={styles.progressConnector} /> : null}
                    <View
                      testID={`withdrawal-step-${step.id}`}
                      style={[styles.progressStep, progressStepStyles[step.state]]}
                      accessibilityRole="text"
                      accessibilityLabel={`${step.title}: ${step.label}`}
                      accessibilityState={{ disabled: step.state === 'locked', selected: step.state === 'current' }}
                    >
                      <Text style={[styles.progressTitle, step.state === 'locked' && styles.progressLockedText]}>{step.title}</Text>
                      <Text style={[styles.progressDetail, step.state === 'locked' && styles.progressLockedText]} numberOfLines={2}>{step.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>

              <View style={styles.ruleCard}>
                <Text style={styles.balanceLabel}>Mức rút tối đa hiện tại</Text>
                <Text style={styles.balanceValue}>{formatVnd(info.maximumAmount)}</Text>
                <Text style={styles.body}>Mỗi lệnh từ {formatVnd(info.minimumAmount)} đến {formatVnd(info.maximumAmount)}.</Text>
              </View>

              {info.kycStatus !== 'verified' ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.cardTitle}>{info.kycStatus === 'pending' ? 'Đang chờ duyệt CCCD' : info.kycStatus === 'rejected' ? 'Cần gửi lại hồ sơ CCCD' : 'Cần xác minh CCCD'}</Text>
                  <Text style={styles.body}>{info.kycRejectionReason || 'Xác minh danh tính trước khi khai báo tài khoản ngân hàng hoặc rút tiền.'}</Text>
                  <ActionButton testID="withdrawal-kyc-open" label={info.kycStatus === 'pending' ? 'Xem hồ sơ xác minh' : 'Xác minh danh tính'} onPress={() => navigation.navigate('CustomerKyc')} />
                </View>
              ) : null}

              {info.kycStatus === 'verified' ? (
                <View style={styles.card}>
                  <View style={styles.sectionHeading}>
                    <View style={styles.iconBox}><Landmark size={20} color={colors.primaryStrong} /></View>
                    <View style={styles.headingText}>
                      <Text style={styles.cardTitle}>Tài khoản nhận tiền</Text>
                      <Text style={styles.bodySmall}>Tên chủ tài khoản phải khớp với tên CCCD đã xác minh.</Text>
                    </View>
                    {bankAccount && !editingBank ? <Pressable testID="withdrawal-bank-edit" style={styles.quietButton} accessibilityRole="button" disabled={posting || savingBank || unknownAck} onPress={() => { setEditingBank(true); setPrepared(null); }}><Text style={styles.quietButtonText}>Sửa</Text></Pressable> : null}
                  </View>
                  {bankAccount && !editingBank ? (
                    <View style={styles.accountSummary}>
                      <Text style={styles.accountName}>{bankAccount.bankName}</Text>
                      <Text style={styles.body}>Tài khoản {maskAccountNumber(bankAccount.accountNumber)}</Text>
                      <Text style={styles.body}>{bankAccount.accountName}</Text>
                    </View>
                  ) : (
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Ngân hàng</Text>
                      <TextInput
                        testID="withdrawal-bank-search"
                        value={bankSearch}
                        onChangeText={value => { setBankSearch(value); setShowBanks(true); setSelectedBank(null); setPrepared(null); }}
                        onFocus={() => setShowBanks(true)}
                        placeholder="Tìm theo tên, mã hoặc BIN"
                        placeholderTextColor={colors.muted}
                        accessibilityLabel="Tìm ngân hàng nhận tiền"
                        style={styles.input}
                      />
                      {showBanks ? <View style={styles.bankOptions}>{visibleBanks.map(bank => (
                        <Pressable key={bank.bin} testID={`withdrawal-bank-option-${bank.bin}`} style={styles.bankOption} onPress={() => { setSelectedBank(bank); setBankSearch(bank.shortName); setShowBanks(false); }} accessibilityRole="button" accessibilityLabel={`Chọn ${bank.shortName}`}>
                          <Text style={styles.bankOptionTitle}>{bank.shortName}</Text>
                          <Text style={styles.bodySmall}>{bank.code} · {bank.bin}</Text>
                        </Pressable>
                      ))}</View> : null}
                      <Text style={styles.label}>Số tài khoản</Text>
                      <TextInput testID="withdrawal-account-number" value={accountNumber} onChangeText={value => { setAccountNumber(value); setPrepared(null); }} keyboardType="number-pad" maxLength={19} placeholder="6–19 chữ số" placeholderTextColor={colors.muted} accessibilityLabel="Số tài khoản nhận tiền" style={styles.input} />
                      <Text style={styles.label}>Tên chủ tài khoản</Text>
                      <TextInput testID="withdrawal-account-name" value={accountName} onChangeText={value => { setAccountName(value); setPrepared(null); }} autoCapitalize="characters" autoComplete="name" placeholder="Như tên trên tài khoản ngân hàng" placeholderTextColor={colors.muted} accessibilityLabel="Tên chủ tài khoản ngân hàng" style={styles.input} />
                      <Text style={styles.helper}>Tên chủ tài khoản cần trùng với CCCD đã xác minh.</Text>
                      <View style={styles.buttonRow}>
                        {bankAccount ? <ActionButton testID="withdrawal-bank-cancel" label="Hủy" variant="secondary" onPress={() => { setEditingBank(false); setSelectedBank(banks.find(bank => bank.bin === bankAccount.bankBin) ?? null); setBankSearch(bankAccount.bankName); setAccountNumber(bankAccount.accountNumber); setAccountName(bankAccount.accountName); setMessage(''); }} /> : null}
                        <ActionButton testID="withdrawal-bank-save" label={savingBank ? 'Đang lưu…' : 'Lưu tài khoản'} disabled={savingBank || posting || unknownAck || !selectedBank} onPress={() => void saveBank()} />
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              {info.kycStatus === 'verified' && !info.payoutAvailable ? <View style={styles.noticeCard}><Text style={styles.cardTitle}>Rút tiền tạm thời chưa khả dụng</Text><Text style={styles.body}>Cổng chi tiền chưa sẵn sàng. Số dư ví không bị trừ.</Text></View> : null}

              {effectiveOpenWithdrawal ? (
                <View style={[styles.noticeCard, styles.warningCard]} testID="withdrawal-open-state">
                  <Text style={styles.cardTitle}>Đang có lệnh rút tiền</Text>
                  <Text style={styles.body}>{formatVnd(wholeVnd(effectiveOpenWithdrawal.amount))} · {withdrawalState(effectiveOpenWithdrawal.status).title}</Text>
                  <Text style={styles.body}>Chờ lệnh này hoàn tất trước khi tạo lệnh khác.</Text>
                </View>
              ) : null}

              {latestWithdrawal ? (
                <View style={[styles.noticeCard, latestCopy?.tone === 'success' && styles.successCard, latestCopy?.tone === 'danger' && styles.dangerCard, latestCopy?.tone === 'warning' && styles.warningCard]} testID="withdrawal-latest-status">
                  <LatestIcon color={latestCopy?.tone === 'success' ? colors.success : latestCopy?.tone === 'danger' ? colors.error : colors.warning} size={22} />
                  <Text style={styles.cardTitle}>{latestCopy?.title}</Text>
                  <Text style={styles.body}>{latestCopy?.detail}</Text>
                  <Text style={styles.body}>{formatVnd(wholeVnd(latestWithdrawal.amount))} · {vnDateTimeString(latestWithdrawal.requestedAt)}</Text>
                </View>
              ) : null}

              {info.kycStatus === 'verified' && bankAccount && !editingBank && info.payoutAvailable && !effectiveOpenWithdrawal ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Rút tiền về ngân hàng</Text>
                  <Text style={styles.body}>Hạn mức được kiểm tra lại trước khi gửi lệnh.</Text>
                  <Text style={styles.label}>Số tiền (VND)</Text>
                  <TextInput
                    testID="withdrawal-amount"
                    value={amountText}
                    onChangeText={value => { setAmountText(value); setPrepared(null); setAmountError(''); setMessage(''); }}
                    keyboardType="number-pad"
                    placeholder="Ví dụ 100000"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Số tiền muốn rút"
                    style={[styles.input, amountError ? styles.inputError : null]}
                    editable={!posting && !unknownAck}
                  />
                  {amountError ? <Text style={styles.errorText} accessibilityRole="alert">{amountError}</Text> : null}
                  {prepared ? (
                    <View style={styles.confirmCard} testID="withdrawal-confirmation">
                      <Text style={styles.cardTitle}>Xác nhận lệnh rút</Text>
                      <Text style={styles.body}>Số tiền: {formatVnd(prepared.amount)}</Text>
                      <Text style={styles.body}>Ngân hàng: {bankAccount.bankName}</Text>
                      <Text style={styles.body}>Tài khoản: {maskAccountNumber(bankAccount.accountNumber)}</Text>
                      <Text style={styles.body}>Chủ tài khoản: {bankAccount.accountName}</Text>
                      <View style={styles.buttonRow}>
                        <ActionButton testID="withdrawal-cancel" label="Quay lại" variant="secondary" onPress={() => setPrepared(null)} />
                        <ActionButton testID="withdrawal-confirm" label={posting ? 'Đang gửi…' : 'Xác nhận rút'} disabled={posting || unknownAck} onPress={() => void confirmWithdrawal()} />
                      </View>
                    </View>
                  ) : (
                    <ActionButton testID="withdrawal-prepare" label="Kiểm tra và tiếp tục" disabled={!canPrepare} onPress={prepareWithdrawal} />
                  )}
                </View>
              ) : null}

              {unknownAck ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.cardTitle}>Chưa rõ kết quả gửi lệnh</Text>
                  <Text style={styles.body}>{message || 'Không gửi lại lệnh tự động.'}</Text>
                  <ActionButton testID="withdrawal-check-status" label={checkingAck ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái'} disabled={checkingAck} variant="secondary" onPress={() => void reconcileUnknown()} />
                </View>
              ) : message ? <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Text> : null}

              <View style={styles.card}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.cardTitle}>Lịch sử rút tiền</Text>
                  <Text style={styles.bodySmall}>Trang {page} / {historyPages}</Text>
                </View>
                {history.data.length === 0 ? (
                  <View style={styles.emptyHistory} testID="withdrawal-empty-history">
                    <Clock3 size={18} color={colors.textSecondary} />
                    <View style={styles.emptyHistoryText}>
                      <Text style={styles.historyTitle}>Chưa có lệnh rút tiền</Text>
                      <Text style={styles.bodySmall}>Lịch sử sẽ hiển thị tại đây.</Text>
                    </View>
                  </View>
                ) : history.data.map(item => {
                  const state = withdrawalState(item.status);
                  return (
                    <View key={item.id} testID={`withdrawal-history-${item.id}`} style={styles.historyRow}>
                      <View style={styles.historyText}>
                        <Text style={styles.historyTitle}>{state.title}</Text>
                        <Text style={styles.bodySmall}>{item.bankName} · {item.bankAccountNumber ?? 'Tài khoản đã ẩn'}</Text>
                        <Text style={styles.bodySmall}>{vnDateTimeString(item.requestedAt)}</Text>
                        {item.status === 'FAILED' ? <Text style={styles.bodySmall}>Tiền đã được hoàn về ví.</Text> : null}
                      </View>
                      <Text style={styles.historyAmount}>{formatVnd(wholeVnd(item.amount))}</Text>
                    </View>
                  );
                })}
                {history.meta.totalPages > 1 ? (
                  <View style={styles.buttonRow}>
                    <ActionButton testID="withdrawal-page-prev" label="Trang trước" variant="secondary" disabled={page <= 1} onPress={() => void loadPage(page - 1)} />
                    <ActionButton testID="withdrawal-page-next" label="Trang sau" variant="secondary" disabled={page >= history.meta.totalPages} onPress={() => void loadPage(page + 1)} />
                  </View>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ActionButton(props: { testID: string; label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' }) {
  const secondary = props.variant === 'secondary';
  return (
    <Pressable
      testID={props.testID}
      style={[styles.actionButton, secondary && styles.secondaryAction, props.disabled && styles.disabledAction]}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      accessibilityLabel={props.label}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  eyebrow: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600', textAlign: 'center' },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  loading: { minHeight: 180, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  body: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 21 },
  bodySmall: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: spacing.sm },
  progress: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  progressStep: { flex: 1, minHeight: 82, justifyContent: 'center', paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  progressStep_complete: { backgroundColor: colors.tone.success.bg, borderColor: colors.tone.success.bg },
  progressStep_current: { backgroundColor: colors.primarySoft, borderColor: colors.primaryStrong },
  progressStep_locked: { backgroundColor: colors.background, borderColor: colors.divider },
  progressConnector: { width: 4, alignSelf: 'center', height: 1, backgroundColor: colors.divider },
  progressTitle: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700', textAlign: 'center' },
  progressDetail: { color: colors.textSecondary, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  progressLockedText: { color: colors.muted },
  ruleCard: { backgroundColor: colors.primarySoft, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: spacing.xs },
  balanceLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  balanceValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  noticeCard: { backgroundColor: colors.tone.info.bg, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: spacing.sm },
  warningCard: { backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.bg },
  successCard: { backgroundColor: colors.tone.success.bg, borderColor: colors.tone.success.bg },
  dangerCard: { backgroundColor: colors.tone.danger.bg, borderColor: colors.tone.danger.bg },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1, gap: spacing.xs },
  quietButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  quietButtonText: { color: colors.primaryStrong, fontSize: fontSize.sm, fontWeight: '700' },
  accountSummary: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, gap: spacing.xs },
  accountName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  formGroup: { gap: spacing.sm },
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing.xs },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface, fontSize: fontSize.md },
  inputError: { borderColor: colors.error },
  bankOptions: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, overflow: 'hidden' },
  bankOption: { minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  bankOptionTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  helper: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 10, backgroundColor: colors.primaryStrong },
  secondaryAction: { borderWidth: 1, borderColor: colors.primaryStrong, backgroundColor: colors.surface },
  disabledAction: { opacity: 0.5 },
  actionText: { color: colors.surface, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' },
  secondaryActionText: { color: colors.primaryStrong },
  confirmCard: { gap: spacing.sm, backgroundColor: colors.tone.warning.bg, borderRadius: 12, padding: spacing.sm, borderWidth: 1, borderColor: colors.tone.warning.bg },
  errorText: { color: colors.error, fontSize: fontSize.xs, lineHeight: 18 },
  message: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  historyRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  historyText: { flex: 1, gap: spacing.xs },
  historyTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  historyAmount: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'right' },
  emptyHistory: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider },
  emptyHistoryText: { flex: 1, gap: 2 },
});
