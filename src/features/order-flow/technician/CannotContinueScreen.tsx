import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder, ordersApi } from '../../../api/orders.api';
import { supportCasesApi } from '../../../api/support-cases.api';
import { visitGroupsApi, type VisitCheckout } from '../../../api/visit-groups.api';
import {
  CannotContinueError, cannotContinuePort, isCustomerNoShow, type ContactKind, type ContactReadiness, type StopReasonCode,
} from '../../../api/cannot-continue.api';
import { lightTheme as colors } from '../../../constants/theme';
import { confirmAction } from '../../../utils/confirm-action';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { backFromFlow } from '../navigation/resume-order';
import { useRegisterVisitDevices, visitDeviceTabName } from '../navigation/visit-device-tabs';
import { captureCameraPhoto } from './camera-capture';
import { visitDeviceTechnicianStatus } from './technician-visit';
import { ConfirmBox, ContactChecklist, DetailsCard, DeviceCard, DoneCard, FormSection, ModeSwitch, ReasonList, type DeviceChoice } from './CannotContinueParts';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { canReportTechnicianIssue, technicianReportBody } from './technician-report';
import {
  STOP_PHOTO_MAX, STOP_REASON_MIN, canAttachStopPhotos, confirmText, deviceDisposition, isSupportCode,
  reasonClassOf, reasonGroups, readinessSummary, stopFormProblem, stopScopeFor, submitLabel, type FormReasonCode, type StopMode,
} from './cannot-continue-form';

const POLL_MS = 15000;

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

  const registerDevices = useRegisterVisitDevices();
  const groupId = order?.visitGroupId ?? null;
  const isVisit = !!groupId;
  const scope = order ? stopScopeFor(order, code) : { kind: 'order' as const, orderId: '' };
  const noShow = mode === 'stop' && !!code && isCustomerNoShow(code as StopReasonCode);
  const photosAllowed = mode === 'stop' && !!order && canAttachStopPhotos(order.status);
  const retry = mode === 'stop' && !!scope.orderId && !!code && cannotContinuePort.isLocked(scope) && cannotContinuePort.retryAllowed(scope);
  const scopeId = scope.kind === 'group' ? `g:${scope.groupId}` : `o:${scope.orderId}`;
  // What was read for another scope (the reason was changed meanwhile) is not shown.
  const readiness = noShow && readinessRec?.key === scopeId ? readinessRec.data : null;
  const checkoutDone = groupId && checkoutRec?.groupId === groupId ? checkoutRec : null;
  const checkout = checkoutDone?.data ?? null;
  const checkoutFailed = !!checkoutDone && !checkoutDone.data;
  const devicesKnown = scope.kind !== 'group' || !!checkout;
  const devices = [...(checkout?.devices ?? [])].sort((a, b) => a.sequence - b.sequence);
  // Which device the report is about (web "Thiết bị báo cáo"): only a visit of several devices has a choice.
  const picker = devices.length > 1;

  // The devices of the visit: the device to report on, and what a whole-visit stop would keep.
  useEffect(() => {
    if (!allowed || !groupId) return;
    let alive = true;
    visitGroupsApi.getCheckout(groupId).then((next) => {
      if (!alive) return;
      setCheckoutRec({ groupId, data: next });
      registerDevices(next.devices.flatMap((d) => (d.serviceOrderId ? [d.serviceOrderId] : [])));
    }).catch(() => { if (alive) setCheckoutRec({ groupId, data: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, groupId]);

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

  // Each device is its own tab: open the report in the tab of the chosen device and close it here (web selectReportDevice).
  const pickDevice = (serviceOrderId: string) => {
    if (busy || assets.length > 0 || serviceOrderId === order?.id) return;
    navigation.navigate(visitDeviceTabName(serviceOrderId), { serviceOrderId, screen: 'CannotContinue', initial: false });
    navigation.goBack();
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
        if (!isSupportCode(code)) { setError('Lý do này không gửi được dưới dạng báo cáo hỗ trợ. Chọn lý do khác.'); return; }
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

  // `done` wins over `allowed`: once the stop is recorded the order turns into a history summary and `allowed` goes false, which must not hide the result.
  const stopping = mode === 'stop';
  const primary = done
    ? { label: 'Quay lại', testID: 'cc-back', onPress: () => backFromFlow(navigation) }
    : allowed ? { label: submitLabel(mode, scope, busy, retry), testID: 'cc-submit', disabled: busy, destructive: stopping, onPress: submit } : undefined;

  // Always above the footer button: a message at the end of the scroll was out of sight, so a refused send looked like nothing happened.
  const feedback = allowed && !done ? (attempted && problem) || error : '';
  const here = devices.find((d) => d.serviceOrderId === order?.id);
  const deviceTitle = here ? `Máy ${here.sequence} · ${here.serviceName || here.deviceLabel || 'Thiết bị'}` : order?.serviceName || 'Thiết bị';
  const choices: DeviceChoice[] = devices.map((d) => {
    const on = d.serviceOrderId === order?.id;
    return {
      id: d.serviceOrderId ?? d.bookingId, seq: d.sequence, title: `Máy ${d.sequence} · ${d.serviceName || d.deviceLabel || 'Thiết bị'}`,
      sub: d.serviceOrderId ? visitDeviceTechnicianStatus(d.state) : 'Chưa có công việc', on, disabled: !d.serviceOrderId || (d.state !== 'open' && !on) || assets.length > 0,
    };
  });
  const doneNext = mode === 'support'
    ? ['Quản lý dịch vụ sẽ xem báo cáo của bạn.', 'Bạn tiếp tục làm đơn như bình thường.']
    : ['Bạn không còn được giao đơn này.', 'FixHome đối soát tiền và linh kiện cũ. Linh kiện đã nhận vẫn cần khai trả ở mục Linh kiện.', 'Khách được hướng dẫn đặt lịch mới.'];

  return (
    <TaskScreenShell title="Báo cáo vấn đề sửa chữa" onBack={() => backFromFlow(navigation)} primary={primary}
      summary={feedback ? <Text testID="cc-problem" accessibilityRole="alert" style={styles.error}>{feedback}</Text> : undefined}>
      {!allowed && !done && <ReadOnlyNotice tone="warning">Chỉ báo cáo được sau khi đã check-in, khi đơn đang trên đường hoặc đang sửa và chưa yêu cầu bàn giao.</ReadOnlyNotice>}

      {!!done && <DoneCard title={mode === 'support' ? 'Đã gửi báo cáo hỗ trợ' : 'Đã dừng công việc'} text={done} next={doneNext} />}

      {allowed && !done && <>
        <FormSection title="Máy báo cáo">
          <DeviceCard title={deviceTitle} sub={order ? `Đơn #${order.code}` : ''} choices={picker ? choices : []} busy={busy} onPick={pickDevice} />
        </FormSection>

        <FormSection title="Cách xử lý">
          <ModeSwitch mode={mode} busy={busy} onPick={pickMode} />
        </FormSection>

        <FormSection title="Lý do">
          <ReasonList groups={reasonGroups(mode, isVisit)} code={code} busy={busy} onPick={(next) => { setCode(next); setConfirmed(false); }} />
          {attempted && !code && <Text accessibilityRole="alert" style={styles.error}>Chọn lý do.</Text>}
        </FormSection>

        {noShow && (
          <FormSection title="Liên hệ khách trước khi dừng">
            <ContactChecklist readiness={readiness} summary={readinessSummary(readiness)} busy={contactBusy} error={contactError}
              onCall={() => void contact('CALL_ATTEMPT')} onNotify={() => void contact('IN_APP_NOTIFICATION')} onRecheck={() => void loadReadiness()}>
              {scope.kind === 'group' && (
                <View testID="cc-devices" style={styles.devices}>
                  <Text style={styles.groupTitle}>Các máy trong lượt</Text>
                  {checkoutFailed && <Text accessibilityRole="alert" style={styles.error}>Chưa xác minh được các máy trong lượt. Tải lại rồi thử lại.</Text>}
                  {checkout?.devices.map((d) => (
                    <View key={d.bookingId} style={styles.deviceRow}>
                      <Text style={[styles.deviceName, styles.flex]} numberOfLines={1}>{d.serviceName || d.deviceLabel || 'Thiết bị'}</Text>
                      <Text style={styles.meta}>{deviceDisposition(d.state, d.serviceOrderId === order?.id)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ContactChecklist>
          </FormSection>
        )}

        <FormSection title="Chi tiết" hint={`Mô tả là bắt buộc, ít nhất ${STOP_REASON_MIN} ký tự.`}>
          <DetailsCard reason={reason} onReason={setReason} busy={busy}
            photos={!stopping ? undefined : photosAllowed
              ? { assets, max: STOP_PHOTO_MAX, onCapture: () => void capture(), onDrop: (index) => setAssets((list) => list.filter((_, i) => i !== index)) }
              : { hint: 'Chỉ chụp ảnh chứng cứ được khi máy đang sửa. Bạn vẫn dừng được mà không cần ảnh.' }} />
          {attempted && reason.trim().length < STOP_REASON_MIN && <Text accessibilityRole="alert" style={styles.error}>{`Mô tả ít nhất ${STOP_REASON_MIN} ký tự.`}</Text>}
        </FormSection>

        {stopping && <ConfirmBox checked={confirmed} busy={busy} text={confirmText(mode, scope)} onToggle={() => setConfirmed((v) => !v)} />}
        {busy && <View style={styles.line}><ActivityIndicator size="small" color={colors.primaryStrong} /><Text style={styles.meta}>Đang gửi báo cáo…</Text></View>}
      </>}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  groupTitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  devices: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  deviceName: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
});
