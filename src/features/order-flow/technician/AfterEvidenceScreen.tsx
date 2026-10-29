import React, { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, FileText } from 'lucide-react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianCompletion } from './useTechnicianCompletion';
import { captureCameraPhoto, confirmCameraPermission } from './camera-capture';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { sameOrderSession } from '../domain/order-session.types';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { LinkRow, Section } from './QuotationItemCards';
import PhotoDraftGallery from '../../../components/technician/PhotoDraftGallery';
import SentEvidenceGallery from './SentEvidenceGallery';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { backFromFlow } from '../navigation/resume-order';

/** Photos taken and not yet sent in one go. */
const MAX_AFTER_DRAFTS = 5;

interface AfterDraft {
  owner: string | null;
  assets: CameraOrderAsset[];
  index: number;
  error: string | null;
  confirmDeleteId: string | null;
}

const AUTHENTICATED_AFTER = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/authenticated\/s--[^/]+\//;

/**
 * T13 — AFTER evidence. Camera capture preview, explicit send with a
 * synchronous reservation around the permission await, and full stale/blur/
 * revoke handling. The local asset clears only after the exact owned
 * GET-confirmed upload; unknown stays on GET-only recovery with no duplicate
 * POST. Footer Next is navigation-only once a real confirmed AFTER allows
 * it; known-insufficient policy blocks the handover transition.
 */
export default function AfterEvidenceScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianCompletion();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const focused = useIsFocused();
  useLoadUnloadedResources(snapshot, ['evidence'], loadResource);

  const [draft, setDraft] = useState<AfterDraft>({ owner: null, assets: [], index: 0, error: null, confirmDeleteId: null });
  const [capturing, setCapturing] = useState(false);
  const [sentIndex, setSentIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const sendRef = useRef(false);

  const fromProposal = route.params?.fromProposal === true;
  const returnProposalId = typeof route.params?.proposalId === 'string' ? route.params.proposalId as string : undefined;

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const underRepair = order?.status === 'UNDER_REPAIR' && !order?.completionRequestedAt;
  // A foreground refresh drops the order to 'loading' for a moment; that is not a revocation, so keep the draft.
  const orderLoading = snapshot?.order.status === 'loading';
  const revoked = !snapshot || snapshot.access !== 'current' || !key || (!orderLoading && (!order || !assignmentValid || !underRepair));
  const owner = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const evidenceReady = snapshot?.resources.evidence.status === 'ready';
  const evidenceLoading = snapshot?.resources.evidence.status === 'loading';
  const ownAfter = evidenceReady && snapshot?.resources.evidence.status === 'ready'
    ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId
      && e.type === 'AFTER' && AUTHENTICATED_AFTER.test(e.mediaUrl))
    : [];
  const assets = !revoked && focused && draft.owner === owner ? draft.assets : [];
  const index = !revoked && draft.owner === owner ? Math.min(draft.index, Math.max(0, assets.length - 1)) : 0;
  // A draft of another order/session is dropped the moment this one writes.
  const current = (d: AfterDraft): AfterDraft => (d.owner === owner ? d : { owner, assets: [], index: 0, error: null, confirmDeleteId: null });
  const captureError = !revoked && draft.owner === owner ? draft.error : null;
  const confirmDeleteId = !revoked && draft.owner === owner ? draft.confirmDeleteId : null;
  const refreshing = snapshot?.order.status === 'loading' || evidenceLoading;
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying' || capturing || sending;
  const hasPendingIntent = snapshot?.pendingIntent === true;
  const isUnresolved = state.phase === 'unknown' || hasPendingIntent;
  const canVerify = !revoked && !busy && isUnresolved;
  const canCapture = focused && !revoked && !busy && !isUnresolved && !!evidenceReady;
  const canSend = canCapture && assets.length > 0 && !sending;

  // Live session view for async continuations: stale owner, blur, revoke or
  // reassignment observed after an await must drop the draft, never send.
  const live = useRef({ key, focused, owner, revoked });
  useLayoutEffect(() => { live.current = { key, focused, owner, revoked }; });

  // The exact owned GET-confirmed upload removes that photo from the draft (see `send`); photos still queued stay.

  const afterMinimum = snapshot?.proofPolicy?.afterMinimum;
  const knownMinimum = typeof afterMinimum === 'number' && Number.isInteger(afterMinimum) && afterMinimum > 0 ? afterMinimum : null;
  const knownInsufficient = knownMinimum !== null && ownAfter.length < knownMinimum;
  const handoverAllowed = !revoked && !busy && !knownInsufficient;
  const footerNext = !busy && !isUnresolved && ownAfter.length > 0 && !knownInsufficient;

  const capture = async (replace = false) => {
    if (!canCapture || capturing) return;
    if (!replace && assets.length >= MAX_AFTER_DRAFTS) {
      setDraft((dr) => ({ ...current(dr), error: `Mỗi lần gửi tối đa ${MAX_AFTER_DRAFTS} ảnh. Hãy gửi các ảnh này trước.` }));
      return;
    }
    setCapturing(true);
    setDraft((dr) => ({ ...current(dr), error: null, confirmDeleteId: null }));
    try {
      const result = await captureCameraPhoto();
      if (!result.ok) {
        setDraft((dr) => ({ ...current(dr), error: result.reason === 'cancelled' ? null : result.message }));
        return;
      }
      setDraft((dr) => {
        const base = current(dr);
        const at = Math.min(base.index, Math.max(0, base.assets.length - 1));
        const next = replace && base.assets.length > 0 ? base.assets.map((x, k) => (k === at ? result.asset : x)) : [...base.assets, result.asset];
        return { ...base, assets: next, index: replace && base.assets.length > 0 ? at : next.length - 1, error: null, confirmDeleteId: null };
      });
    } catch {
      setDraft((dr) => ({ ...current(dr), error: 'Chưa chụp được ảnh. Hãy thử lại.' }));
    } finally {
      setCapturing(false);
    }
  };

  const send = async () => {
    if (!canSend || sendRef.current) return;
    sendRef.current = true;
    setSending(true);
    const pressOwner = owner;
    try {
      if (!(await confirmCameraPermission())) {
        if (live.current.owner === pressOwner) {
          setDraft({ owner: pressOwner, assets: [], index: 0, error: 'Quyền camera đã bị thu hồi trước khi gửi. Bản nháp đã được xóa; hãy chụp lại.', confirmDeleteId: null });
        }
        return;
      }
      // One photo at a time through the frozen command guards; the first failure stops the queue and keeps the rest.
      const queue = assets;
      for (const item of queue) {
        const liveState = live.current;
        if (!liveState.focused || liveState.revoked || liveState.owner !== pressOwner
          || !liveState.key || !sameOrderSession(liveState.key, key)) {
          setDraft({ owner: pressOwner, assets: [], index: 0, error: null, confirmDeleteId: null });
          return;
        }
        await controller.uploadAfter(item);
        if (controller.getState().phase !== 'resolved') return;
        setDraft((dr) => {
          const base = current(dr);
          const rest = base.assets.filter((x) => x !== item);
          return { ...base, assets: rest, index: Math.min(base.index, Math.max(0, rest.length - 1)) };
        });
      }
    } finally {
      sendRef.current = false;
      setSending(false);
    }
  };

  const askDelete = (evidenceId: string) => {
    if (!canCapture) return;
    void controller.requestDeleteAfter(evidenceId);
    setDraft((dr) => ({ ...current(dr), error: null, confirmDeleteId: evidenceId }));
  };

  const confirmDelete = () => {
    if (!canCapture || !confirmDeleteId) return;
    setDraft((dr) => ({ ...current(dr), error: null, confirmDeleteId: null }));
    void controller.submitConfirmation();
  };

  const returnToProposal = () => {
    if (!fromProposal) return;
    // Installed StackRouter 7 pushes a NEW route for a plain two-arg
    // navigate, which would orphan the mounted proposal draft. Pop back to
    // the existing ExtraProposal and merge only the typed refresh signal
    // (existing costId/proposalId params are preserved by merge). A missing
    // parent never falls back to a new blank proposal.
    const routes = navigation.getState?.()?.routes ?? [];
    const parent = [...routes].reverse().find(r => r.name === 'ExtraProposal');
    if (!parent) return;
    navigation.navigate('ExtraProposal',
      { ...(returnProposalId ? { proposalId: returnProposalId } : {}), capturedAfter: true },
      { pop: true, merge: true });
  };

  const primaryLabel = capturing
    ? 'Đang mở camera…'
      : sending
      ? 'Đang gửi ảnh…'
      : canVerify
        ? 'Kiểm tra lại'
        : assets.length > 1
          ? `Gửi ${assets.length} ảnh`
          : assets.length === 1
            ? 'Gửi ảnh'
            : 'Chụp ảnh';

  return (
    <TaskScreenShell
      title="Ảnh sau sửa chữa"
      stage={3}
      onBack={() => backFromFlow(navigation)}
      secondary={
        footerNext
          ? { label: 'Bàn giao', testID: 'task-handover-next', disabled: !handoverAllowed,
              accessibilityHint: 'Mở bước bàn giao đã có ảnh xác nhận từ máy chủ',
              onPress: () => { if (handoverAllowed) navigation.navigate('CompletionRequest'); } }
          : { label: 'Làm mới dữ liệu', testID: 'task-refresh', disabled: !canRefresh || busy,
              onPress: () => {
                if (canRefresh && !busy) {
                  if (snapshot?.resources.evidence.status === 'unloaded') void loadResource('evidence');
                  void refresh('manual');
                }
              } }
      }
      primary={{
        label: primaryLabel,
        testID: canVerify ? 'after-verify' : assets.length ? 'after-send' : 'after-capture',
        disabled: canVerify ? false : assets.length ? !canSend : !canCapture,
        onPress: () => {
          if (revoked || busy || sendRef.current) return;
          if (canVerify) {
            void controller.verify();
            return;
          }
          if (assets.length) void send();
          else if (canCapture) void capture();
        },
      }}
    >
      <View style={styles.summary}>
        <View>
          <Text style={styles.caption}>Mã đơn</Text>
          <Text selectable style={styles.code}>{order?.code || 'Chưa có thông tin'}</Text>
        </View>
        <View style={styles.countRow}>
          <Text style={styles.count} accessibilityLabel={evidenceReady ? `${ownAfter.length} ảnh đã xác nhận` : 'Đang tải số ảnh'}>{evidenceReady ? String(ownAfter.length) : '…'}</Text>
          <View style={styles.countText}>
            <Text style={styles.countTitle}>Ảnh sau sửa chữa đã xác nhận</Text>
            {knownMinimum !== null ? <Text style={styles.caption}>Cần tối thiểu {knownMinimum} ảnh</Text> : null}
          </View>
          {evidenceReady ? (
            <View style={[styles.chip, { backgroundColor: colors.tone[knownInsufficient ? 'warning' : ownAfter.length ? 'success' : 'neutral'].bg }]}>
              <Text style={[styles.chipText, { color: colors.tone[knownInsufficient ? 'warning' : ownAfter.length ? 'success' : 'neutral'].text }]}>
                {knownInsufficient ? 'Cần thêm ảnh' : ownAfter.length ? 'Đã có ảnh' : 'Chưa có ảnh'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi, phân công không còn thuộc về bạn hoặc đơn đã qua bước sửa chữa. Bản nháp ảnh đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : snapshot?.resources.evidence.status === 'error' ? (
        <ReadOnlyNotice tone="error">Chưa tải được danh sách ảnh từ máy chủ. Kiểm tra kết nối, ứng dụng sẽ tự tải lại.</ReadOnlyNotice>
      ) : !evidenceReady ? (
        <ReadOnlyNotice>Đang tải danh sách ảnh từ máy chủ. Mọi thao tác chụp, gửi và xóa đều khóa cho đến khi dữ liệu ảnh đầy đủ.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>Hãy chụp ảnh hiện trạng sau sửa chữa bằng camera. Chỉ ảnh đã được máy chủ xác nhận mới dùng cho bàn giao.</ReadOnlyNotice>
      )}
      {knownInsufficient ? (
        <ReadOnlyNotice tone="warning">Số ảnh sau sửa chữa chưa đạt yêu cầu đã biết của đợt kiểm tra. Hãy chụp và gửi thêm trước khi sang bàn giao.</ReadOnlyNotice>
      ) : null}
      {assets.length ? (
        <Section title={assets.length > 1 ? `Ảnh vừa chụp (${assets.length}/${MAX_AFTER_DRAFTS})` : 'Ảnh vừa chụp'} hint={assets.length > 1 ? `Đã chụp ${assets.length} ảnh. Kiểm tra kỹ rồi mới gửi.` : 'Đã chụp xong. Kiểm tra kỹ rồi mới gửi.'}>
          <View style={styles.previewWrap}>
            <PhotoDraftGallery
              photos={assets}
              index={index}
              onSelect={(next) => setDraft((dr) => ({ ...current(dr), index: next }))}
              previewTestID="after-preview"
              label="Ảnh sau sửa chữa vừa chụp"
            />
            <View style={styles.actions}>
              {assets.length < MAX_AFTER_DRAFTS ? (
                <Pressable testID="after-add" accessibilityRole="button" accessibilityLabel="Chụp thêm ảnh" disabled={busy}
                  onPress={() => { void capture(); }} style={({ pressed }) => [styles.action, busy && styles.dim, pressed && styles.pressed]}>
                  <Text style={styles.actionText}>Chụp thêm</Text>
                </Pressable>
              ) : null}
              <Pressable testID="after-retake" accessibilityRole="button" accessibilityLabel="Chụp lại ảnh" disabled={busy}
                onPress={() => { void capture(true); }} style={({ pressed }) => [styles.action, busy && styles.dim, pressed && styles.pressed]}>
                <Text style={styles.actionText}>Chụp lại</Text>
              </Pressable>
              <Pressable testID="after-cancel" accessibilityRole="button" accessibilityLabel="Hủy ảnh vừa chụp" disabled={busy}
                onPress={() => {
                  setDraft((dr) => {
                    const base = current(dr);
                    const at = Math.min(base.index, Math.max(0, base.assets.length - 1));
                    const rest = base.assets.filter((_, k) => k !== at);
                    return { ...base, assets: rest, index: Math.min(at, Math.max(0, rest.length - 1)), error: null, confirmDeleteId: null };
                  });
                }} style={({ pressed }) => [styles.action, busy && styles.dim, pressed && styles.pressed]}>
                <Text style={styles.actionTextMuted}>Hủy ảnh</Text>
              </Pressable>
            </View>
          </View>
        </Section>
      ) : null}
      {ownAfter.length > 0 ? (
        <Section title={`Ảnh đã gửi (${ownAfter.length})`}>
          <SentEvidenceGallery
            photos={ownAfter}
            index={sentIndex}
            onSelect={setSentIndex}
            label="Ảnh sau sửa chữa đã gửi"
            testPrefix="after"
            canDelete={canCapture}
            busy={busy}
            confirmDeleteId={confirmDeleteId}
            onAskDelete={askDelete}
            onCancelDelete={() => setDraft((dr) => ({ ...current(dr), error: null, confirmDeleteId: null }))}
            onConfirmDelete={confirmDelete}
          />
        </Section>
      ) : null}
      {captureError ? <ReadOnlyNotice>{captureError}</ReadOnlyNotice> : null}
      {state.phase === 'denied' && state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
      {isUnresolved ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả hoặc có thao tác đang chờ đối chiếu. Không gửi lại; hãy kiểm tra từ hệ thống trước khi thử lại.</ReadOnlyNotice>
      ) : null}
      <Section title="Xem thêm">
        {fromProposal ? (
          <LinkRow testID="after-return-proposal" label="Quay lại đề xuất phát sinh" Icon={ArrowLeft} onPress={returnToProposal} />
        ) : null}
        <LinkRow testID="task-handover-link" label="Xem bàn giao" Icon={FileText} disabled={!handoverAllowed}
          onPress={() => { if (handoverAllowed) navigation.navigate('CompletionRequest'); }} />
      </Section>
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  caption: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  code: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { minWidth: 44, color: colors.primaryStrong, fontSize: 32, lineHeight: 40, fontWeight: '700' },
  countText: { flex: 1, minWidth: 0, gap: 2 },
  countTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  chip: { flexShrink: 0, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  previewWrap: { padding: spacing.md, gap: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  actionText: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  actionTextMuted: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  danger: { backgroundColor: colors.tone.danger.bg, borderColor: colors.error },
  dangerText: { color: colors.tone.danger.text, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  photoRow: { padding: spacing.md, gap: 12 },
  photoMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  photoText: { flex: 1, minWidth: 0 },
  photoTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  confirm: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, gap: 8 },
  confirmText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
