import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fundedCheckoutApi, type VoucherCheckoutPreview } from '../../../api/funded-checkout.api';
import { vouchersApi, type GeneralVoucher, type VoucherClaim } from '../../../api/vouchers.api';
import { spacing, useAppTheme } from '../../../constants/theme';
import { claimState, conditionLabel, discountLabel, isVoucherCode, unsavedGeneral, voucherDate } from '../../../screens/customer/voucher-view';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { formatVnd } from '../../../utils/format';
import { DetailRow } from '../shared/TaskScreenShell';
import {
  countdown, newUuidV4, previewBlock, secondsLeft, toApplied, usableClaims, VOUCHER_HOLD_EXPIRED, type AppliedVoucher,
} from './voucher-checkout';

type Phase = 'closed' | 'loading' | 'ready' | 'error';

/**
 * Pay with a voucher (web #180). Pick a saved voucher, read the server's price with it, hold it, then the payment screens
 * pay the server's amount. Nothing is calculated here. Holding is a step before payment: the invoice stays at its full
 * amount until the server confirms a payment.
 */
export default function VoucherCheckoutSection({
  scopeId, applied, disabled, keepWhenExpired, onApplied, onReleased,
}: {
  /** The ServiceOrder id of a single order, or the VisitGroup id of a visit. */
  scopeId: string;
  applied: AppliedVoucher | null;
  disabled?: boolean;
  /** True while a cash declaration waits on the hold: the customer still confirms through it after the 15 minutes. */
  keepWhenExpired?: boolean;
  onApplied: (voucher: AppliedVoucher) => void;
  onReleased: (reason?: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [phase, setPhase] = useState<Phase>('closed');
  const [claims, setClaims] = useState<VoucherClaim[]>([]);
  const [general, setGeneral] = useState<GeneralVoucher[]>([]);
  const [tab, setTab] = useState<'mine' | 'general'>('mine');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoucherCheckoutPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [holding, setHolding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // One attempt id per chosen voucher, so a retry of an unclear answer cannot hold twice.
  const attempt = useRef<{ claimId: string; id: string } | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const open = phase !== 'closed';
  const left = applied ? secondsLeft(applied, now) : 0;

  useEffect(() => {
    if (!applied) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [applied]);

  useEffect(() => {
    if (applied && !keepWhenExpired && secondsLeft(applied, now) === 0) onReleased(VOUCHER_HOLD_EXPIRED);
  }, [applied, keepWhenExpired, now, onReleased]);

  const load = async () => {
    setPhase('loading');
    setError('');
    try {
      // The general offers are a bonus: without them the wallet and the code entry still work.
      const [wallet, offers] = await Promise.all([vouchersApi.wallet(), vouchersApi.general().catch(() => [] as GeneralVoucher[])]);
      if (!live.current) return;
      const usable = usableClaims(wallet);
      const unsaved = unsavedGeneral(offers, wallet);
      setClaims(usable);
      setGeneral(unsaved);
      setTab(usable.length === 0 && unsaved.length > 0 ? 'general' : 'mine');
      setPhase('ready');
    } catch (err) {
      if (!live.current) return;
      setError(extractApiErrorMessage(err, 'Chưa tải được ví ưu đãi. Vui lòng thử lại.'));
      setPhase('error');
    }
  };

  const toggle = () => {
    if (disabled || holding) return;
    if (open) { setPhase('closed'); return; }
    void load();
  };

  const choose = async (claim: VoucherClaim) => {
    if (disabled || holding || previewing) return;
    setSelected(claim.id);
    setPreview(null);
    setError('');
    setPreviewing(true);
    try {
      const result = await fundedCheckoutApi.preview(claim.id, scopeId);
      if (live.current) setPreview(result);
    } catch (err) {
      if (live.current) setError(extractApiErrorMessage(err, 'Voucher không đủ điều kiện cho hóa đơn này hoặc máy chủ chưa xác nhận được.'));
    } finally {
      if (live.current) setPreviewing(false);
    }
  };

  // Saves a code (typed, or a general offer) in the wallet, then previews it for this invoice. Saving does not discount anything.
  const saveCode = async (value: string) => {
    if (!isVoucherCode(value) || saving || holding || previewing || disabled) return;
    setSaving(true);
    setError('');
    try {
      const claim = await vouchersApi.claim(value);
      const wallet = await vouchersApi.wallet();
      if (!live.current) return;
      setClaims(usableClaims(wallet));
      setGeneral((current) => unsavedGeneral(current, wallet));
      setCode('');
      setTab('mine');
      void choose(claim);
    } catch (err) {
      if (live.current) setError(extractApiErrorMessage(err, 'Chưa lưu được mã ưu đãi. Hãy kiểm tra mã rồi thử lại.'));
    } finally {
      if (live.current) setSaving(false);
    }
  };

  const hold = async () => {
    if (!selected || !preview || previewBlock(preview) || holding || disabled) return;
    if (attempt.current?.claimId !== selected) attempt.current = { claimId: selected, id: newUuidV4() };
    setHolding(true);
    setError('');
    try {
      const reservation = await fundedCheckoutApi.reserve(selected, scopeId, attempt.current.id);
      const voucher = toApplied(reservation, preview);
      if (!voucher) {
        await fundedCheckoutApi.release(reservation.id).catch(() => undefined);
        if (live.current) setError('Máy chủ chưa xác nhận voucher cho hóa đơn này.');
        return;
      }
      if (live.current) { setNow(Date.now()); setPhase('closed'); }
      onApplied(voucher);
    } catch (err) {
      if (live.current) setError(extractApiErrorMessage(err, 'Chưa giữ được voucher. Bạn có thể thử lại.'));
    } finally {
      if (live.current) setHolding(false);
    }
  };

  const release = async () => {
    if (!applied || holding) return;
    setHolding(true);
    try {
      await fundedCheckoutApi.release(applied.reservationId);
    } catch {
      // The hold ends by itself; the payment goes back to the full amount either way.
    } finally {
      attempt.current = null;
      if (live.current) { setHolding(false); setSelected(null); setPreview(null); }
      onReleased();
    }
  };

  const block = preview ? previewBlock(preview) : null;
  return (
    <View
      style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: spacing.md, gap: 8 }}
      testID="voucher-checkout"
    >
      <TouchableOpacity
        onPress={toggle}
        disabled={disabled || holding || !!applied}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        accessibilityLabel="Voucher ưu đãi"
        testID="voucher-checkout-toggle"
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Voucher ưu đãi</Text>
        {!applied ? <Text style={{ fontSize: 13, color: colors.textSecondary }}>Dùng voucher đã lưu để giảm số tiền phải trả</Text> : null}
      </TouchableOpacity>

      {applied ? (
        <View testID="voucher-applied" style={{ gap: 4 }}>
          <DetailRow label="Tổng gốc" value={formatVnd(applied.originalGrossVnd)} />
          <DetailRow label="Voucher giảm" value={`- ${formatVnd(applied.discountVnd)}`} />
          <DetailRow label="Bạn trả" value={formatVnd(applied.customerDueVnd)} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }} accessibilityLiveRegion="polite">
            Voucher đang được giữ, còn {countdown(left)}. Số tiền do máy chủ tính.
          </Text>
          <TouchableOpacity
            onPress={() => void release()}
            disabled={holding || disabled}
            accessibilityRole="button"
            accessibilityLabel="Bỏ voucher"
            testID="voucher-release"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14 }}>{holding ? 'Đang bỏ voucher…' : 'Bỏ voucher'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={open && !applied} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!holding) setPhase('closed'); }}>
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Chọn voucher</Text>
            <TouchableOpacity onPress={() => setPhase('closed')} disabled={holding} accessibilityRole="button" accessibilityLabel="Đóng bảng chọn voucher" testID="voucher-sheet-close" style={styles.closeBtn}>
              <Text style={styles.closeText}>Đóng</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {phase === 'loading' ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : null}
              {phase === 'error' ? (
                <View style={styles.center}>
                  <Text style={styles.error} accessibilityRole="alert">{error}</Text>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => void load()} accessibilityRole="button">
                    <Text style={styles.primaryText}>Thử lại</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {phase === 'ready' ? (
                <>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Bạn có mã ưu đãi?</Text>
                    <Text style={styles.hint}>Nhập mã để lưu vào ví và xem giá với hóa đơn này. Lưu mã không tự giảm giá.</Text>
                    <TextInput
                      style={styles.input}
                      value={code}
                      onChangeText={setCode}
                      onSubmitEditing={() => void saveCode(code)}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={40}
                      placeholder="Nhập mã ưu đãi"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Mã ưu đãi"
                      editable={!saving && !holding}
                      returnKeyType="done"
                      testID="voucher-code-input"
                    />
                    <TouchableOpacity
                      style={[styles.primaryBtn, (!isVoucherCode(code) || saving || holding || previewing) && styles.disabled]}
                      disabled={!isVoucherCode(code) || saving || holding || previewing}
                      onPress={() => void saveCode(code)}
                      accessibilityRole="button"
                      accessibilityLabel="Lưu mã và chọn"
                      accessibilityState={{ disabled: !isVoucherCode(code) || saving }}
                      testID="voucher-code-submit"
                    >
                      <Text style={styles.primaryText}>{saving ? 'Đang lưu…' : 'Lưu và chọn'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.tabs} accessibilityRole="tablist">
                    {([['mine', `Của tôi (${claims.length})`], ['general', `Ưu đãi chung (${general.length})`]] as const).map(([key, label]) => (
                      <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)} accessibilityRole="tab"
                        accessibilityState={{ selected: tab === key }} testID={`voucher-tab-${key}`}>
                        <Text style={[styles.tabText, tab === key && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {tab === 'mine' && claims.length === 0 ? (
                    <View style={styles.center} testID="voucher-checkout-empty">
                      <Text style={styles.cardTitle}>Chưa có voucher dùng được</Text>
                      <Text style={styles.hint}>Xem tab Ưu đãi chung hoặc nhập mã ở trên.</Text>
                    </View>
                  ) : null}
                  {tab === 'general' && general.length === 0 ? (
                    <View style={styles.center}>
                      <Text style={styles.cardTitle}>Chưa có ưu đãi chung mới</Text>
                      <Text style={styles.hint}>Khi có chương trình mới, ưu đãi sẽ hiện ở đây.</Text>
                    </View>
                  ) : null}

                  {tab === 'mine' ? claims.map((claim) => (
                    <TouchableOpacity
                      key={claim.id}
                      style={[styles.card, selected === claim.id && styles.cardSelected]}
                      onPress={() => void choose(claim)}
                      disabled={holding || previewing || saving}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: selected === claim.id }}
                      testID={`voucher-option-${claim.id}`}
                    >
                      <View style={styles.row}>
                        <Text style={[styles.cardTitle, styles.flex]} numberOfLines={2}>{claim.campaign.name}</Text>
                        <Text style={styles.badge}>{selected === claim.id ? 'Đang chọn' : claimState(claim).label}</Text>
                      </View>
                      <Text style={styles.discount}>{discountLabel(claim.policy)}</Text>
                      <Text style={styles.hint}>{conditionLabel(claim.policy)}</Text>
                      <Text style={styles.hint}>Hạn dùng: {voucherDate(claim.campaign.endsAt)}</Text>
                    </TouchableOpacity>
                  )) : general.map((voucher) => (
                    <View key={voucher.id} style={styles.card} testID={`voucher-general-${voucher.id}`}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{voucher.name}</Text>
                      <Text style={styles.discount}>{discountLabel(voucher.policy)}</Text>
                      <Text style={styles.hint}>{conditionLabel(voucher.policy)}</Text>
                      <Text style={styles.hint}>Hạn dùng: {voucherDate(voucher.endsAt)}</Text>
                      <TouchableOpacity style={[styles.secondaryBtn, (saving || holding || previewing) && styles.disabled]} onPress={() => void saveCode(voucher.code)}
                        disabled={saving || holding || previewing} accessibilityRole="button" accessibilityLabel={`Lưu và chọn ưu đãi ${voucher.name}`}>
                        <Text style={styles.secondaryText}>{saving ? 'Đang lưu…' : 'Lưu và chọn'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : null}

              {previewing ? <Text style={styles.hint} accessibilityLiveRegion="polite">Đang tải bản xem trước từ máy chủ…</Text> : null}
              {preview ? (
                <View style={styles.card} testID="voucher-preview">
                  <Text style={styles.cardTitle}>Giá với voucher này</Text>
                  <DetailRow label="Tổng gốc" value={formatVnd(preview.originalGrossVnd)} />
                  <DetailRow label="Voucher giảm" value={`- ${formatVnd(preview.originalGrossVnd - preview.customerDueVnd)}`} />
                  <DetailRow label="Bạn trả" value={formatVnd(preview.customerDueVnd)} />
                  {block ? <Text style={styles.error} accessibilityRole="alert">{block}</Text> : null}
                  <TouchableOpacity
                    style={[styles.primaryBtn, (!!block || holding || disabled) && styles.disabled]}
                    onPress={() => void hold()}
                    disabled={!!block || holding || disabled}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!block || holding || !!disabled }}
                    testID="voucher-hold"
                  >
                    <Text style={styles.primaryText}>{holding ? 'Đang giữ voucher…' : 'Giữ voucher và thanh toán'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.hint}>Voucher được giữ tối đa 15 phút. Hóa đơn chưa đổi cho đến khi máy chủ xác nhận thanh toán.</Text>
                </View>
              ) : null}
              {error && phase !== 'error' ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// The same look as the saved-voucher page (CustomerVouchersScreen): cards, tint tabs, one primary button.
const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8 },
  sheetTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  closeBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { fontSize: 14, fontWeight: '600', color: colors.primaryStrong },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 8 },
  cardSelected: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discount: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.primaryStrong },
  badge: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  error: { fontSize: 14, lineHeight: 20, color: colors.tone.danger.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primaryTint },
  tabText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: colors.primaryStrong, fontWeight: '700' },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondaryBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
