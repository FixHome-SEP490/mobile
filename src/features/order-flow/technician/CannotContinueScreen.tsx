import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { Camera, Check, Phone, X } from 'lucide-react-native';
import { isHistoricalOrder, ordersApi } from '../../../api/orders.api';
import { supportCasesApi } from '../../../api/support-cases.api';
import { visitGroupsApi, type VisitCheckout } from '../../../api/visit-groups.api';
import {
  CannotContinueError, cannotContinuePort, isCustomerNoShow, type ContactKind, type ContactReadiness, type StopReasonCode,
} from '../../../api/cannot-continue.api';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { confirmAction } from '../../../utils/confirm-action';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { vnDateTimeString } from '../../../utils/vn-time';
import PillText from '../../../components/PillText';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { backFromFlow } from '../navigation/resume-order';
import { captureCameraPhoto } from './camera-capture';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { canReportTechnicianIssue, technicianReportBody } from './technician-report';
import {
  NO_SHOW_RULE, STOP_PHOTO_MAX, STOP_REASON_MAX, STOP_REASON_MIN, canAttachStopPhotos, confirmText, deviceDisposition, isSupportCode,
  reasonClassOf, reasonsFor, readinessSummary, stopFormProblem, stopScopeFor, submitLabel, type FormReasonCode, type StopMode,
} from './cannot-continue-form';

const POLL_MS = 15000;

const Decor = ({ children }: { children: React.ReactNode }) => (
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
);

function Step({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepNo}><Text style={styles.stepNoText}>{step}</Text></View>
        <Text accessibilityRole="header" style={styles.stepTitle}>{title}</Text>
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

/**
 * "Báo cáo vấn đề sửa chữa" (web CannotContinueDialog): after check-in the technician either stops the work on this
 * device for good, or asks the manager for help while the work goes on. A customer who is not there stops the whole
 * visit, and only once the contact rule is met. Money and parts of the stopped work are settled by the manager.
 */
export default function CannotContinueScreen() {
  const navigation = useNavigation<any>();
  const { key, snapshot, refresh } = useOrderSession();
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const allowed = !!order && !!key && snapshot?.access === 'current' && order.id === key.serviceOrderId
    && order.technician?.id === key.userId && canReportTechnicianIssue(order);

  const [mode, setMode] = useState<StopMode>('stop');
  const [code, setCode] = useState<FormReasonCode | null>(null);
  const [reason, setReason] = useState('');
  const [assets, setAssets] = useState<CameraOrderAsset[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [readinessRec, setReadinessRec] = useState<{ key: string; data: ContactReadiness } | null>(null);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const [checkoutRec, setCheckoutRec] = useState<{ groupId: string; data: VisitCheckout | null } | null>(null);
  const uploaded = useRef<Record<string, string>>({});

  const isVisit = !!order?.visitGroupId;
  const scope = order ? stopScopeFor(order, code) : { kind: 'order' as const, orderId: '' };
  const noShow = mode === 'stop' && !!code && isCustomerNoShow(code as StopReasonCode);
  const photosAllowed = mode === 'stop' && !!order && canAttachStopPhotos(order.status);
  const retry = mode === 'stop' && !!scope.orderId && !!code && cannotContinuePort.isLocked(scope) && cannotContinuePort.retryAllowed(scope);
  const scopeId = scope.kind === 'group' ? `g:${scope.groupId}` : `o:${scope.orderId}`;
  // What was read for another scope (the reason was changed meanwhile) is not shown.
  const readiness = noShow && readinessRec?.key === scopeId ? readinessRec.data : null;
  const checkoutDone = scope.kind === 'group' && checkoutRec?.groupId === scope.groupId ? checkoutRec : null;
  const checkout = checkoutDone?.data ?? null;
  const checkoutFailed = !!checkoutDone && !checkoutDone.data;
  const devicesKnown = scope.kind !== 'group' || !!checkout;

  // The devices of the visit are read only when the whole visit would stop.
  useEffect(() => {
    if (!allowed || scope.kind !== 'group' || !noShow) return;
    let alive = true;
    const groupId = scope.groupId;
    visitGroupsApi.getCheckout(groupId).then((next) => { if (alive) setCheckoutRec({ groupId, data: next }); }).catch(() => { if (alive) setCheckoutRec({ groupId, data: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, noShow, scope.kind === 'group' ? scope.groupId : '']);

  const loadReadiness = useCallback(async () => {
    if (!allowed || !noShow) return;
    try { const data = await cannotContinuePort.readiness(scope); setReadinessRec({ key: scopeId, data }); setContactError(''); }
    catch (e) { setContactError(extractApiErrorMessage(e, 'Chưa kiểm tra được điều kiện liên hệ. Thử lại sau.')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, noShow, scopeId]);

  // The contact rule is read on entry and every 15 s; the server clock decides, never this phone's.
  useEffect(() => {
    if (!allowed || !noShow) return;
    let alive = true;
    const read = () => {
      cannotContinuePort.readiness(scope)
        .then((data) => { if (alive) { setReadinessRec({ key: scopeId, data }); setContactError(''); } })
        .catch((e) => { if (alive) setContactError(extractApiErrorMessage(e, 'Chưa kiểm tra được điều kiện liên hệ. Thử lại sau.')); });
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, noShow, scopeId]);

  const contact = async (kind: ContactKind) => {
    if (contactBusy || !order) return;
    setContactBusy(true);
    setContactError('');
    try {
      if (kind === 'CALL_ATTEMPT' && order.customerPhone) await Linking.openURL(`tel:${order.customerPhone}`).catch(() => undefined);
      setReadinessRec({ key: scopeId, data: await cannotContinuePort.contact(scope, kind) });
    } catch (e) {
      setContactError(extractApiErrorMessage(e, 'Chưa ghi nhận được lần liên hệ. Dùng nút này lần nữa để đối chiếu.'));
    } finally { setContactBusy(false); }
  };

  const pickMode = (next: StopMode) => {
    if (busy || next === mode) return;
    setMode(next);
    setCode(null);
    setConfirmed(false);
    setError('');
  };

  const capture = async () => {
    if (busy || assets.length >= STOP_PHOTO_MAX) return;
    const result = await captureCameraPhoto();
    if (!result.ok) { if (result.reason !== 'cancelled') setError(result.message); return; }
    setError('');
    setAssets((list) => [...list, result.asset]);
  };

  const problem = stopFormProblem({ mode, code, reason, confirmed, scope, readiness, devicesKnown });

  const send = async () => {
    if (!order || !code) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'support') {
        if (!isSupportCode(code)) return;
        await supportCasesApi.createTechnicianReport(technicianReportBody(order.id, code, reason));
        setDone('Đã gửi báo cáo hỗ trợ. Công việc vẫn tiếp tục; báo cáo này không dừng hoặc hủy đơn.');
      } else {
        const ids: string[] = [];
        if (photosAllowed) {
          for (const asset of assets) {
            uploaded.current[asset.uri] ??= (await ordersApi.uploadEvidenceAdditional(order.id, { uri: asset.uri, name: asset.name, type: asset.type })).id;
            ids.push(uploaded.current[asset.uri]);
          }
        }
        const out = await cannotContinuePort.stop(scope, {
          reasonClass: reasonClassOf(code), reasonCode: code as StopReasonCode, reason, photoEvidenceIds: ids,
        });
        setDone(scope.kind === 'group'
          ? `Đã dừng ${out.stoppedCount} máy, giữ nguyên ${out.preservedCount} máy. Tiền và linh kiện cũ cần đối soát riêng.`
          : 'Đã dừng công việc và nhả phân công. Tiền và linh kiện cũ được đối soát riêng.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void refresh('manual');
    } catch (e) {
      setError(e instanceof CannotContinueError ? e.message : extractApiErrorMessage(e, 'Chưa gửi được yêu cầu. Kiểm tra lý do và ảnh chứng cứ rồi thử lại.'));
    } finally { setBusy(false); }
  };

  const submit = () => {
    if (busy || !order) return;
    setAttempted(true);
    if (problem) return;
    if (mode === 'support') { void send(); return; }
    confirmAction({
      title: scope.kind === 'group' ? 'Dừng cả lượt sửa?' : 'Dừng công việc này?',
      message: 'Việc dừng không thể hoàn tác. Bạn sẽ không còn được giao công việc này; tiền và linh kiện đã có do quản lý đối soát.',
      confirmLabel: submitLabel(mode, scope, false, false),
      destructive: true,
      onConfirm: () => void send(),
    });
  };

  const primary = done
    ? { label: 'Quay lại', testID: 'cc-back', onPress: () => backFromFlow(navigation) }
    : allowed ? { label: submitLabel(mode, scope, busy, retry), testID: 'cc-submit', disabled: busy, onPress: submit } : undefined;

  const reasonOptions = reasonsFor(mode, isVisit);
  return (
    <TaskScreenShell title="Báo cáo vấn đề sửa chữa" onBack={() => backFromFlow(navigation)} primary={primary}>
      {!allowed && <ReadOnlyNotice tone="warning">Chỉ báo cáo được sau khi đã check-in, khi đơn đang trên đường hoặc đang sửa và chưa yêu cầu bàn giao.</ReadOnlyNotice>}

      {allowed && !!done && (
        <View testID="cc-done" accessibilityRole="summary" style={styles.done}>
          <View style={styles.doneIcon}><Decor><Check size={22} strokeWidth={2.5} color={colors.surface} /></Decor></View>
          <Text style={styles.doneText}>{done}</Text>
        </View>
      )}

      {allowed && !done && <>
        <Step step={1} title="Cách xử lý">
          <View accessibilityRole="radiogroup" style={styles.stack}>
            {([['stop', 'Không thể tiếp tục máy này', 'Dừng công việc, nhả phân công.'], ['support', 'Nhờ quản lý hỗ trợ, vẫn tiếp tục', 'Chỉ gửi báo cáo, công việc vẫn tiếp tục.']] as const).map(([value, label, sub]) => {
              const on = mode === value;
              return (
                <Pressable key={value} testID={`cc-mode-${value}`} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }} disabled={busy}
                  onPress={() => pickMode(value)} style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}>
                  <View style={styles.flex}><Text style={styles.optionLabel}>{label}</Text><Text style={styles.hint}>{sub}</Text></View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <Decor><Check size={14} strokeWidth={3} color={colors.surface} /></Decor>}</View>
                </Pressable>
              );
            })}
          </View>
        </Step>

        <Step step={2} title="Lý do">
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {reasonOptions.map((option) => {
              const on = code === option.code;
              return (
                <Pressable key={option.code} testID={`cc-reason-${option.code}`} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }} disabled={busy}
                  onPress={() => { setCode(option.code); setConfirmed(false); }} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
                  <PillText style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</PillText>
                </Pressable>
              );
            })}
          </View>
          {attempted && !code && <Text accessibilityRole="alert" style={styles.error}>Chọn lý do.</Text>}
        </Step>

        {noShow && (
          <Step step={3} title="Liên hệ khách" hint={NO_SHOW_RULE}>
            {scope.kind === 'group' && (
              <View testID="cc-devices" style={styles.stack}>
                {checkoutFailed && <Text accessibilityRole="alert" style={styles.error}>Chưa xác minh được các máy trong lượt. Tải lại rồi thử lại.</Text>}
                {checkout?.devices.map((d) => (
                  <View key={d.bookingId} style={styles.deviceRow}>
                    <Text style={[styles.optionLabel, styles.flex]} numberOfLines={1}>{d.serviceName || d.deviceLabel || 'Thiết bị'}</Text>
                    <Text style={styles.meta}>{deviceDisposition(d.state, d.serviceOrderId === order?.id)}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text testID="cc-readiness" style={styles.meta}>{readinessSummary(readiness)}</Text>
            {!!readiness && !readiness.ready && !!readiness.nextEligibleAt && (
              <Text style={styles.meta}>{`Có thể dừng sau ${vnDateTimeString(readiness.nextEligibleAt)}`}</Text>
            )}
            {readiness?.ready && <Text style={[styles.meta, { color: colors.tone.success.text }]}>Đủ điều kiện liên hệ.</Text>}
            <View style={styles.buttons}>
              <Pressable testID="cc-call" accessibilityRole="button" disabled={contactBusy} onPress={() => void contact('CALL_ATTEMPT')} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Decor><Phone size={18} strokeWidth={1.75} color={colors.primaryStrong} /></Decor>
                <Text style={styles.buttonText}>Gọi khách và ghi nhận</Text>
              </Pressable>
              <Pressable testID="cc-notify" accessibilityRole="button" disabled={contactBusy} onPress={() => void contact('IN_APP_NOTIFICATION')} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>Gửi thông báo trong ứng dụng</Text>
              </Pressable>
              <Pressable testID="cc-recheck" accessibilityRole="button" disabled={contactBusy} onPress={() => void loadReadiness()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>Kiểm tra điều kiện</Text>
              </Pressable>
            </View>
            {contactBusy && <ActivityIndicator size="small" color={colors.primaryStrong} />}
            {!!contactError && <Text accessibilityRole="alert" style={styles.error}>{contactError}</Text>}
          </Step>
        )}

        <Step step={noShow ? 4 : 3} title="Mô tả tình huống (bắt buộc)">
          <View style={styles.labelRow}>
            <Text style={styles.label}>Mô tả</Text>
            <Text style={styles.counter}>{`${reason.trim().length}/${STOP_REASON_MAX}`}</Text>
          </View>
          <TextInput testID="cc-reason-text" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={STOP_REASON_MAX}
            accessibilityLabel="Mô tả tình huống" accessibilityHint={`Ít nhất ${STOP_REASON_MIN} ký tự`} placeholder="Ví dụ: bo mạch cháy, hãng đã ngừng bán linh kiện"
            placeholderTextColor={colors.textSecondary} style={styles.input} />
          {attempted && reason.trim().length < STOP_REASON_MIN && <Text accessibilityRole="alert" style={styles.error}>{`Mô tả ít nhất ${STOP_REASON_MIN} ký tự.`}</Text>}
        </Step>

        {mode === 'stop' && (
          <Step step={noShow ? 5 : 4} title={`Ảnh chứng cứ (không bắt buộc, tối đa ${STOP_PHOTO_MAX})`}
            hint={photosAllowed ? 'Ảnh riêng tư, chỉ bạn và quản lý xem được.' : 'Chỉ chụp ảnh chứng cứ được khi máy đang sửa. Bạn vẫn dừng được mà không cần ảnh.'}>
            {photosAllowed && (
              <View style={styles.grid}>
                {assets.map((asset, index) => (
                  <View key={asset.uri} style={styles.tile}>
                    <Image source={{ uri: asset.uri }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh chứng cứ ${index + 1}`} style={styles.photo} />
                    <Pressable testID={`cc-drop-photo-${index}`} accessibilityRole="button" accessibilityLabel={`Xóa ảnh ${index + 1}`} disabled={busy} hitSlop={8}
                      onPress={() => setAssets((list) => list.filter((_, i) => i !== index))} style={({ pressed }) => [styles.drop, pressed && styles.pressed]}>
                      <Decor><X size={16} strokeWidth={2.5} color={colors.surface} /></Decor>
                    </Pressable>
                  </View>
                ))}
                {assets.length < STOP_PHOTO_MAX && (
                  <Pressable testID="cc-capture" accessibilityRole="button" accessibilityLabel="Chụp ảnh chứng cứ" disabled={busy} onPress={() => void capture()}
                    style={({ pressed }) => [styles.tile, styles.add, pressed && styles.pressed]}>
                    <Decor><Camera size={24} strokeWidth={1.75} color={colors.primaryStrong} /></Decor>
                    <Text style={styles.addText}>Chụp ảnh</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Step>
        )}

        {mode === 'stop' && (
          <Pressable testID="cc-confirm" accessibilityRole="checkbox" accessibilityState={{ checked: confirmed, disabled: busy }} disabled={busy}
            onPress={() => setConfirmed((v) => !v)} style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}>
            <View style={[styles.box, confirmed && styles.boxOn]}>{confirmed && <Decor><Check size={16} strokeWidth={3} color={colors.surface} /></Decor>}</View>
            <Text style={styles.confirmText}>{confirmText(mode, scope)}</Text>
          </Pressable>
        )}

        {attempted && !!problem && !!code && reason.trim().length >= STOP_REASON_MIN && (
          <Text testID="cc-problem" accessibilityRole="alert" style={styles.error}>{problem}</Text>
        )}
        {busy && <View style={styles.line}><ActivityIndicator size="small" color={colors.primaryStrong} /><Text style={styles.meta}>Đang gửi báo cáo…</Text></View>}
        {!!error && <ReadOnlyNotice tone="error">{error}</ReadOnlyNotice>}
      </>}
    </TaskScreenShell>
  );
}

const TARGET = 48;
const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 8 },
  pressed: { opacity: 0.8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: 12 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '700' },
  stepTitle: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  option: { minHeight: TARGET + 8, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionLabel: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexGrow: 1, flexBasis: '47%', minHeight: TARGET, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  chipTextOn: { color: colors.primaryStrong, fontWeight: '700' },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  buttons: { gap: 8 },
  button: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  buttonText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  counter: { color: colors.textSecondary, fontSize: 12 },
  input: { minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  photo: { width: '100%', height: '100%', backgroundColor: colors.divider },
  drop: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addText: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600' },
  confirm: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  confirmText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: 14, backgroundColor: colors.tone.success.bg },
  doneIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tone.success.fg, alignItems: 'center', justifyContent: 'center' },
  doneText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },
});
