import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { Camera, Check, Clock, MapPin, X } from 'lucide-react-native';
import { isHistoricalOrder, ordersApi, type DelayDecision, type DelayReasonCode } from '../../../api/orders.api';
import {
  DELAY_MINUTES, DELAY_PHOTO_MAX, DELAY_REASON_MAX, DELAY_REASON_MIN, DELAY_REASONS, delayDraftErrors, delayReportErrorText,
  type DelayField,
} from '../../../screens/technician/technician-overrun-release';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { backFromFlow } from '../navigation/resume-order';
import { captureCameraPhoto } from './camera-capture';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useReleasableOrders } from './useReleasableOrders';
import PillText from '../../../components/PillText';

/** Decorative icons next to visible text stay out of the screen reader's way. */
const Decor = ({ children }: { children: React.ReactNode }) => (
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
);

const reasonLabel = (code: DelayReasonCode | null | undefined) => DELAY_REASONS.find((r) => r.code === code)?.label ?? 'Lý do khác';

function Step({ step, title, hint, error, children }: { step: number; title: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepNo}><Text style={styles.stepNoText}>{step}</Text></View>
        <Text accessibilityRole="header" style={styles.stepTitle}>{title}</Text>
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}

/** What the technician told the customer: read back from Backend, or just sent from this screen until Backend answers. */
interface Report {
  orderId: string;
  minutes: number;
  reasonCode: DelayReasonCode | null;
  reason: string | null;
  decision: DelayDecision | null;
  noticedAt: string | null;
  photoUris: string[];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><View style={styles.rowValue}>{children}</View></View>;
}

function ReportSummary({ report, code, when, address, onEdit }: { report: Report; code: string; when?: string; address?: string; onEdit: () => void }) {
  const waiting = report.decision === null;
  return (
    <View testID="delay-summary" style={styles.stack}>
      <View accessibilityRole="summary" style={[styles.banner, waiting ? styles.bannerWait : styles.bannerOk]}>
        <View style={[styles.bannerIcon, { backgroundColor: waiting ? colors.tone.warning.fg : colors.tone.success.fg }]}>
          <Decor>{waiting ? <Clock size={22} strokeWidth={2} color={colors.surface} /> : <Check size={22} strokeWidth={2.5} color={colors.surface} />}</Decor>
        </View>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[styles.bannerTitle, { color: waiting ? colors.tone.warning.text : colors.tone.success.text }]}>
            {waiting ? 'Đã báo trễ, chờ khách trả lời' : 'Khách đồng ý đợi thêm'}
          </Text>
          <Text style={styles.bannerText}>
            {waiting
              ? 'Khách sẽ chọn đợi thêm, đổi kỹ thuật viên hoặc hủy. Bạn sẽ nhận thông báo khi khách trả lời.'
              : `Hãy tới đơn #${code} đúng giờ bạn đã báo, trễ khoảng ${report.minutes} phút.`}
          </Text>
        </View>
      </View>

      <View style={styles.step}>
        <Text accessibilityRole="header" style={styles.stepTitle}>Báo cáo đã gửi</Text>
        <Row label="Đơn kế tiếp">
          <Text style={styles.value}>{`#${code}`}</Text>
          {!!when && <Text style={styles.meta}>{when}</Text>}
          {!!address && <Text style={styles.meta} numberOfLines={2}>{address}</Text>}
        </Row>
        <Row label="Trễ dự kiến"><Text style={styles.value}>{`${report.minutes} phút`}</Text></Row>
        <Row label="Lý do"><Text style={styles.value}>{reasonLabel(report.reasonCode)}</Text></Row>
        {!!report.reason && <Row label="Mô tả"><Text style={styles.value}>{report.reason}</Text></Row>}
        {!!report.noticedAt && <Row label="Báo lúc"><Text style={styles.value}>{vnDateTimeString(report.noticedAt)}</Text></Row>}
        {report.photoUris.length > 0 && (
          <Row label={`Ảnh bằng chứng (${report.photoUris.length})`}>
            <View style={styles.grid}>
              {report.photoUris.map((uri, i) => (
                <View key={uri} style={styles.tile}>
                  <Image source={{ uri }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh bằng chứng ${i + 1}`} style={styles.photo} />
                </View>
              ))}
            </View>
          </Row>
        )}
      </View>

      {waiting && (
        <Pressable testID="delay-edit" accessibilityRole="button" onPress={onEdit} style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
          <Text style={styles.editText}>Báo lại với thông tin mới</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The technician, still on this job, tells the customer of the next order it will start late (PO 31/10/2026).
 * The customer decides: wait, another technician, or cancel. A reason, 1 to 3 photos of THIS job and a
 * confirmation are saved with the report so the manager can read why; once sent, the report is shown, not the form.
 */
export default function DelayReportScreen() {
  const navigation = useNavigation<any>();
  const { key, snapshot, loadResource } = useOrderSession();
  useLoadUnloadedResources(snapshot, ['evidence'], loadResource);
  const { items: all, loading, reload } = useReleasableOrders(key?.userId);
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const repairing = !!order && !!key && snapshot?.access === 'current' && order.id === key.serviceOrderId
    && order.technician?.id === key.userId && order.status === 'UNDER_REPAIR' && !order.completionRequestedAt;
  // Only the upcoming orders Backend ties to THIS job; the report's photos belong to it.
  const items = all.filter((item) => item.status.currentOrderId === order?.id);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<DelayReasonCode | null>(null);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [assets, setAssets] = useState<CameraOrderAsset[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const [editing, setEditing] = useState(false);
  const [justSent, setJustSent] = useState<Report | null>(null);
  // A photo already uploaded keeps its evidence id, so a retry after a failed send never uploads it twice.
  const uploaded = useRef<Record<string, string>>({});

  const selected = items.find((item) => item.job.id === pickedId) ?? items[0] ?? null;
  const errors = delayDraftErrors({ orderId: selected?.job.id ?? null, reasonCode, reason, photoCount: assets.length, confirmed, minutes });
  const shown: Partial<Record<DelayField, string>> = attempted ? errors : {};

  // The report of the picked order: Backend's once it has one, else what was just sent from here.
  const evidence = snapshot?.resources.evidence;
  const urlOf = (id: string) => (evidence?.status === 'ready' ? evidence.data.find((e) => e.id === id)?.mediaUrl : undefined);
  const notice = selected?.status.delayNotice ?? null;
  const report: Report | null = !selected ? null : notice
    ? { orderId: selected.job.id, minutes: notice.minutes, reasonCode: notice.reasonCode, reason: notice.reason ?? null, decision: notice.decision, noticedAt: notice.noticedAt,
      photoUris: (notice.evidenceIds ?? []).map(urlOf).filter((u): u is string => !!u) }
    : justSent?.orderId === selected.job.id ? justSent : null;

  const capture = async () => {
    if (busy || assets.length >= DELAY_PHOTO_MAX) return;
    const result = await captureCameraPhoto();
    if (!result.ok) { if (result.reason !== 'cancelled') setSendError(result.message); return; }
    setSendError('');
    setAssets((list) => [...list, result.asset]);
  };

  const submit = async () => {
    if (busy || !selected || !order) return;
    setAttempted(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setSendError('');
    try {
      const ids: string[] = [];
      for (const asset of assets) {
        uploaded.current[asset.uri] ??= (await ordersApi.uploadEvidenceAdditional(order.id, { uri: asset.uri, name: asset.name, type: asset.type })).id;
        ids.push(uploaded.current[asset.uri]);
      }
      await ordersApi.sendDelayNotice(selected.job.id, { reasonCode: reasonCode!, reason: reason.trim(), evidenceIds: ids, confirm: true, delayMinutes: minutes! });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJustSent({ orderId: selected.job.id, minutes: minutes!, reasonCode, reason: reason.trim(), decision: null, noticedAt: new Date().toISOString(), photoUris: assets.map((a) => a.uri) });
      setEditing(false);
      setAttempted(false);
      setAssets([]);
      setReason('');
      setConfirmed(false);
      reload();
    } catch (err) {
      setSendError(delayReportErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const showReport = repairing && !!selected && !!report && !editing;
  const showForm = repairing && !!selected && !showReport;
  const primary = showReport
    ? { label: 'Quay lại đơn', testID: 'delay-back', onPress: () => backFromFlow(navigation) }
    : showForm ? { label: busy ? 'Đang gửi…' : 'Báo trễ cho khách', testID: 'delay-send-notice', disabled: busy, onPress: () => void submit() } : undefined;

  return (
    <TaskScreenShell title="Báo trễ đơn kế tiếp" onBack={() => backFromFlow(navigation)} primary={primary}>
      {!repairing && <ReadOnlyNotice tone="warning">Chỉ báo trễ được khi đơn bạn đang làm còn đang sửa và chưa yêu cầu bàn giao.</ReadOnlyNotice>}
      {repairing && loading && <ReadOnlyNotice>Đang kiểm tra các đơn kế tiếp…</ReadOnlyNotice>}
      {repairing && !loading && !selected && <ReadOnlyNotice>Chưa có đơn kế tiếp nào cần báo trễ.</ReadOnlyNotice>}

      {showReport && selected && report && (
        <ReportSummary report={report} code={selected.job.code || selected.job.id.slice(0, 8)}
          when={selected.job.scheduledAt ? vnDateTimeString(selected.job.scheduledAt) : undefined} address={selected.job.addressSummary} onEdit={() => setEditing(true)} />
      )}

      {showForm && selected && <>
        <ReadOnlyNotice>{`Bạn đang làm đơn #${order?.code}. Báo cho khách biết bạn sẽ tới trễ; khách quyết định đợi, đổi kỹ thuật viên hoặc hủy. Không bị trừ điểm uy tín.`}</ReadOnlyNotice>

        <Step step={1} title="Đơn kế tiếp" error={shown.order}>
          <View accessibilityRole="radiogroup" style={styles.stack}>
            {items.map((item) => {
              const code = item.job.code || item.job.id.slice(0, 8);
              const on = item.job.id === selected.job.id;
              const sentBefore = item.status.delayNotice;
              return (
                <Pressable key={item.job.id} testID={`delay-order-${item.job.id}`} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }}
                  accessibilityLabel={`Đơn ${code}${item.job.scheduledAt ? `, ${vnDateTimeString(item.job.scheduledAt)}` : ''}`}
                  disabled={busy} onPress={() => setPickedId(item.job.id)} style={({ pressed }) => [styles.order, on && styles.orderOn, pressed && styles.pressed]}>
                  <View style={styles.orderBody}>
                    <Text style={styles.orderCode}>{`#${code}`}</Text>
                    {!!item.job.scheduledAt && <View style={styles.line}><Decor><Clock size={16} strokeWidth={1.75} color={colors.textSecondary} /></Decor><Text style={styles.meta}>{vnDateTimeString(item.job.scheduledAt)}</Text></View>}
                    {!!item.job.addressSummary && <View style={styles.line}><Decor><MapPin size={16} strokeWidth={1.75} color={colors.textSecondary} /></Decor><Text style={[styles.meta, styles.flex]} numberOfLines={2}>{item.job.addressSummary}</Text></View>}
                    {!!sentBefore && <Text style={styles.sentNote}>{sentBefore.decision === 'wait' ? 'Khách đã chọn đợi thêm' : `Đã báo trễ ${sentBefore.minutes} phút · chờ khách trả lời`}</Text>}
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <Decor><Check size={14} strokeWidth={3} color={colors.surface} /></Decor>}</View>
                </Pressable>
              );
            })}
          </View>
        </Step>

        <Step step={2} title="Lý do" error={shown.reasonCode}>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {DELAY_REASONS.map((option) => {
              const on = reasonCode === option.code;
              return (
                <Pressable key={option.code} testID={`delay-reason-${option.code}`} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }}
                  disabled={busy} onPress={() => setReasonCode(option.code)} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
                  <PillText style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</PillText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Mô tả tình huống</Text>
            <Text style={styles.counter}>{`${reason.trim().length}/${DELAY_REASON_MAX}`}</Text>
          </View>
          <TextInput testID="delay-reason-text" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={DELAY_REASON_MAX}
            accessibilityLabel="Mô tả tình huống" accessibilityHint={`Ít nhất ${DELAY_REASON_MIN} ký tự`} placeholder="Ví dụ: phát hiện thêm lỗi bo mạch, cần thêm thời gian sửa"
            placeholderTextColor={colors.textSecondary} style={[styles.input, !!shown.reason && styles.inputError]} />
          {!!shown.reason && <Text accessibilityRole="alert" style={styles.error}>{shown.reason}</Text>}
        </Step>

        <Step step={3} title="Số phút trễ dự kiến" error={shown.minutes}>
          <View accessibilityRole="radiogroup" style={styles.segment}>
            {DELAY_MINUTES.map((m) => {
              const on = minutes === m;
              return (
                <Pressable key={m} testID={`delay-minutes-${m}`} accessibilityRole="radio" accessibilityLabel={`${m} phút`} accessibilityState={{ selected: on, disabled: busy }}
                  disabled={busy} onPress={() => setMinutes(m)} style={({ pressed }) => [styles.seg, on && styles.segOn, pressed && styles.pressed]}>
                  <Text style={[styles.segNum, on && styles.segTextOn]}>{m}</Text>
                  <Text style={[styles.segUnit, on && styles.segTextOn]}>phút</Text>
                </Pressable>
              );
            })}
          </View>
        </Step>

        <Step step={4} title={`Ảnh bằng chứng (${assets.length}/${DELAY_PHOTO_MAX})`} hint="Chụp ảnh đơn đang sửa cho thấy lỗi hoặc tiến độ. Ảnh riêng tư, chỉ bạn và quản lý dịch vụ xem được." error={shown.photos}>
          <View style={styles.grid}>
            {assets.map((asset, index) => (
              <View key={asset.uri} style={styles.tile}>
                <Image source={{ uri: asset.uri }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh bằng chứng ${index + 1}`} style={styles.photo} />
                <Pressable testID={`delay-drop-photo-${index}`} accessibilityRole="button" accessibilityLabel={`Xóa ảnh ${index + 1}`} disabled={busy}
                  hitSlop={8} onPress={() => setAssets((list) => list.filter((_, i) => i !== index))} style={({ pressed }) => [styles.drop, pressed && styles.pressed]}>
                  <Decor><X size={16} strokeWidth={2.5} color={colors.surface} /></Decor>
                </Pressable>
              </View>
            ))}
            {assets.length < DELAY_PHOTO_MAX && (
              <Pressable testID="delay-capture" accessibilityRole="button" accessibilityLabel="Chụp ảnh bằng chứng" disabled={busy} onPress={() => void capture()}
                style={({ pressed }) => [styles.tile, styles.add, pressed && styles.pressed]}>
                <Decor><Camera size={24} strokeWidth={1.75} color={colors.primaryStrong} /></Decor>
                <Text style={styles.addText}>Chụp ảnh</Text>
              </Pressable>
            )}
          </View>
        </Step>

        <Pressable testID="delay-confirm" accessibilityRole="checkbox" accessibilityState={{ checked: confirmed, disabled: busy }} disabled={busy}
          onPress={() => setConfirmed((v) => !v)} style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}>
          <View style={[styles.box, confirmed && styles.boxOn]}>{confirmed && <Decor><Check size={16} strokeWidth={3} color={colors.surface} /></Decor>}</View>
          <Text style={styles.confirmText}>Tôi xác nhận thông tin và ảnh là thật.</Text>
        </Pressable>
        {!!shown.confirm && <Text accessibilityRole="alert" style={styles.error}>{shown.confirm}</Text>}

        {busy && <View style={styles.line}><ActivityIndicator size="small" color={colors.primaryStrong} /><Text style={styles.meta}>Đang tải ảnh và gửi báo cáo…</Text></View>}
        {!!sendError && <ReadOnlyNotice tone="error">{sendError}</ReadOnlyNotice>}
        {editing && (
          <Pressable testID="delay-keep" accessibilityRole="button" disabled={busy} onPress={() => setEditing(false)} style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
            <Text style={styles.editText}>Giữ báo cáo đã gửi</Text>
          </Pressable>
        )}
      </>}
    </TaskScreenShell>
  );
}

const TARGET = 48;
const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 8 },
  pressed: { opacity: 0.8 },
  step: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: 12 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '700' },
  stepTitle: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  value: { color: colors.text, fontSize: 15, lineHeight: 22 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: 14 },
  bannerWait: { backgroundColor: colors.tone.warning.bg },
  bannerOk: { backgroundColor: colors.tone.success.bg },
  bannerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 2 },
  row: { gap: 4, paddingTop: 4 },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { gap: 2 },
  editBtn: { minHeight: TARGET, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  editText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },

  order: { minHeight: TARGET + 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  orderOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  orderBody: { flex: 1, gap: 4 },
  orderCode: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  sentNote: { color: colors.tone.warning.text, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexGrow: 1, flexBasis: '47%', minHeight: TARGET, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  chipTextOn: { color: colors.primaryStrong, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  counter: { color: colors.textSecondary, fontSize: 12 },
  input: { minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  inputError: { borderColor: colors.tone.danger.fg },

  segment: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, minHeight: TARGET + 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  segNum: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  segUnit: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  segTextOn: { color: colors.surface },

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
});
