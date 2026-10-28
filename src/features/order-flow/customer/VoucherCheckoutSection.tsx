import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { fundedCheckoutApi, type VoucherCheckoutPreview } from '../../../api/funded-checkout.api';
import { vouchersApi, type VoucherClaim } from '../../../api/vouchers.api';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { discountLabel, voucherDate } from '../../../screens/customer/voucher-view';
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
  const [phase, setPhase] = useState<Phase>('closed');
  const [claims, setClaims] = useState<VoucherClaim[]>([]);
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
      const wallet = await vouchersApi.wallet();
      if (!live.current) return;
      setClaims(usableClaims(wallet));
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

      {open && !applied ? (
        <View style={{ gap: 8 }}>
          {phase === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
          {phase === 'error' ? (
            <TouchableOpacity onPress={() => void load()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.primaryStrong, fontWeight: '600' }}>Thử lại</Text>
            </TouchableOpacity>
          ) : null}
          {phase === 'ready' && claims.length === 0 ? (
            <Text style={{ fontSize: 14, color: colors.textSecondary }} testID="voucher-checkout-empty">Chưa có voucher đã lưu để dùng.</Text>
          ) : null}
          {phase === 'ready' ? claims.map((claim) => (
            <TouchableOpacity
              key={claim.id}
              onPress={() => void choose(claim)}
              disabled={holding || previewing}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === claim.id }}
              testID={`voucher-option-${claim.id}`}
              style={{ minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: selected === claim.id ? colors.primaryStrong : colors.border, padding: spacing.sm, justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{claim.campaign.name}</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{discountLabel(claim.policy)} · Hạn {voucherDate(claim.campaign.endsAt)}</Text>
            </TouchableOpacity>
          )) : null}
          {previewing ? <Text style={{ fontSize: 13, color: colors.textSecondary }}>Đang tải bản xem trước từ máy chủ…</Text> : null}
          {preview ? (
            <View style={{ gap: 4 }} testID="voucher-preview">
              <DetailRow label="Tổng gốc" value={formatVnd(preview.originalGrossVnd)} />
              <DetailRow label="Voucher giảm" value={`- ${formatVnd(preview.originalGrossVnd - preview.customerDueVnd)}`} />
              <DetailRow label="Bạn trả" value={formatVnd(preview.customerDueVnd)} />
              {block ? <Text style={{ fontSize: 13, color: colors.tone.danger.text }} accessibilityRole="alert">{block}</Text> : null}
              <TouchableOpacity
                onPress={() => void hold()}
                disabled={!!block || holding || disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!block || holding || !!disabled }}
                testID="voucher-hold"
                style={{ minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', opacity: block || holding ? 0.5 : 1 }}
              >
                <Text style={{ color: colors.surface, fontWeight: '600', fontSize: 14 }}>{holding ? 'Đang giữ voucher…' : 'Giữ voucher và thanh toán'}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Voucher được giữ tối đa 15 phút. Hóa đơn chưa đổi cho đến khi máy chủ xác nhận thanh toán.</Text>
            </View>
          ) : null}
          {error ? <Text style={{ fontSize: 13, color: colors.tone.danger.text }} accessibilityRole="alert">{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
