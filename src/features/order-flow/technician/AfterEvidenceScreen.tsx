import React, { useLayoutEffect, useRef, useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianCompletion } from './useTechnicianCompletion';
import { captureCameraPhoto, confirmCameraPermission } from './camera-capture';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { sameOrderSession } from '../domain/order-session.types';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';

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

  const [draft, setDraft] = useState<{ owner: string | null; asset: CameraOrderAsset | null; error: string | null; confirmDeleteId: string | null }>({
    owner: null, asset: null, error: null, confirmDeleteId: null,
  });
  const [capturing, setCapturing] = useState(false);
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
  const asset = !revoked && focused && draft.owner === owner ? draft.asset : null;
  const captureError = !revoked && draft.owner === owner ? draft.error : null;
  const confirmDeleteId = !revoked && draft.owner === owner ? draft.confirmDeleteId : null;
  const refreshing = snapshot?.order.status === 'loading' || evidenceLoading;
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying' || capturing || sending;
  const hasPendingIntent = snapshot?.pendingIntent === true;
  const isUnresolved = state.phase === 'unknown' || hasPendingIntent;
  const canVerify = !revoked && !busy && isUnresolved;
  const canCapture = focused && !revoked && !busy && !isUnresolved && !!evidenceReady;
  const canSend = canCapture && !!asset && !sending;

  // Live session view for async continuations: stale owner, blur, revoke or
  // reassignment observed after an await must drop the draft, never send.
  const live = useRef({ key, focused, owner, revoked });
  useLayoutEffect(() => { live.current = { key, focused, owner, revoked }; });

  // The exact owned GET-confirmed upload clears the local asset. Unknown
  // keeps recovery (no duplicate POST: resubmit stays locked while
  // unresolved and the journal reservation rejects a second dispatch).
  // Render-phase adjustment like the other task screens: each new
  // confirmation id clears a leftover draft exactly once.
  const confirmedId = state.confirmedUpload?.id ?? null;
  const [clearedFor, setClearedFor] = useState<string | null>(null);
  if (confirmedId && clearedFor !== confirmedId) {
    setClearedFor(confirmedId);
    setDraft(previous => (previous.asset ? { owner: previous.owner, asset: null, error: null, confirmDeleteId: null } : previous));
  }

  const afterMinimum = snapshot?.proofPolicy?.afterMinimum;
  const knownMinimum = typeof afterMinimum === 'number' && Number.isInteger(afterMinimum) && afterMinimum > 0 ? afterMinimum : null;
  const knownInsufficient = knownMinimum !== null && ownAfter.length < knownMinimum;
  const handoverAllowed = !revoked && !busy && !knownInsufficient;
  const footerNext = !busy && !isUnresolved && ownAfter.length > 0 && !knownInsufficient;

  const capture = async () => {
    if (!canCapture || capturing) return;
    setCapturing(true);
    setDraft({ owner, asset: null, error: null, confirmDeleteId: null });
    try {
      const result = await captureCameraPhoto();
      if (!result.ok) {
        setDraft({ owner, asset: null, error: result.reason === 'cancelled' ? null : result.message, confirmDeleteId: null });
        return;
      }
      setDraft({ owner, asset: result.asset, error: null, confirmDeleteId: null });
    } catch {
      setDraft({ owner, asset: null, error: 'Chưa chụp được ảnh. Hãy thử lại.', confirmDeleteId: null });
    } finally {
      setCapturing(false);
    }
  };

  const send = async () => {
    if (!canSend || !asset || sendRef.current) return;
    sendRef.current = true;
    setSending(true);
    const pressOwner = owner;
    try {
      if (!(await confirmCameraPermission())) {
        if (live.current.owner === pressOwner) {
          setDraft({ owner: pressOwner, asset: null, error: 'Quyền camera đã bị thu hồi trước khi gửi. Bản nháp đã được xóa; hãy chụp lại.', confirmDeleteId: null });
        }
        return;
      }
      const liveState = live.current;
      if (!liveState.focused || liveState.revoked || liveState.owner !== pressOwner
        || !liveState.key || !sameOrderSession(liveState.key, key)) {
        setDraft({ owner: pressOwner, asset: null, error: null, confirmDeleteId: null });
        return;
      }
      await controller.uploadAfter(asset);
      // Clear synchronously only on the exact GET-confirmed upload; the
      // effect above covers confirmations that land via later readbacks.
      if (controller.getState().confirmedUpload) {
        setDraft({ owner: pressOwner, asset: null, error: null, confirmDeleteId: null });
      }
    } finally {
      sendRef.current = false;
      setSending(false);
    }
  };

  const askDelete = (evidenceId: string) => {
    if (!canCapture) return;
    void controller.requestDeleteAfter(evidenceId);
    setDraft({ owner, asset: null, error: null, confirmDeleteId: evidenceId });
  };

  const confirmDelete = () => {
    if (!canCapture || !confirmDeleteId) return;
    setDraft({ owner, asset: null, error: null, confirmDeleteId: null });
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
        : asset
          ? 'Gửi ảnh'
          : 'Chụp ảnh';

  return (
    <TaskScreenShell
      title="Ảnh sau sửa chữa"
      stage={3}
      onBack={() => navigation.goBack()}
      secondary={
        footerNext
          ? { label: 'Xem bàn giao', testID: 'task-handover-next', disabled: !handoverAllowed,
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
        testID: canVerify ? 'after-verify' : asset ? 'after-send' : 'after-capture',
        disabled: canVerify ? false : asset ? !canSend : !canCapture,
        onPress: () => {
          if (revoked || busy || sendRef.current) return;
          if (canVerify) {
            void controller.verify();
            return;
          }
          if (asset) void send();
          else if (canCapture) void capture();
        },
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Ảnh sau sửa chữa đã xác nhận" value={evidenceReady ? String(ownAfter.length) : 'Đang tải…'} />
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
        <ReadOnlyNotice>Số ảnh sau sửa chữa chưa đạt yêu cầu đã biết của đợt kiểm tra. Hãy chụp và gửi thêm trước khi sang bàn giao.</ReadOnlyNotice>
      ) : null}
      {asset ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Đã chụp xong. Kiểm tra kỹ rồi mới gửi.</Text>
          <Image
            testID="after-preview"
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: colors.border }}
            resizeMode="cover"
            accessibilityLabel="Ảnh sau sửa chữa vừa chụp"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              testID="after-retake"
              accessibilityRole="button"
              accessibilityLabel="Chụp lại ảnh"
              disabled={busy}
              onPress={() => { void capture(); }}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Chụp lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="after-cancel"
              accessibilityRole="button"
              accessibilityLabel="Hủy ảnh vừa chụp"
              disabled={busy}
              onPress={() => { setDraft({ owner, asset: null, error: null, confirmDeleteId: null }); }}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Hủy ảnh</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {ownAfter.map(item => (
        <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 8 }}>
          <DetailRow label="Ảnh đã gửi" value={item.createdAt ? vnDateTimeString(item.createdAt) : item.id} />
          {confirmDeleteId === item.id ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>Xóa ảnh này khỏi đơn? Thao tác cần máy chủ xác nhận.</Text>
              <TouchableOpacity
                testID={`after-delete-confirm-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel="Xác nhận xóa ảnh"
                disabled={busy}
                onPress={confirmDelete}
                style={{
                  minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.error,
                  alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.error, fontWeight: '700', fontSize: 14, lineHeight: 20 }}>Xác nhận xóa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`after-delete-cancel-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel="Giữ lại ảnh"
                onPress={() => setDraft({ owner, asset: null, error: null, confirmDeleteId: null })}
                style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Giữ lại ảnh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              testID={`after-delete-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel="Xóa ảnh này"
              disabled={!canCapture}
              onPress={() => askDelete(item.id)}
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: !canCapture ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.error, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Xóa ảnh này</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {captureError ? <ReadOnlyNotice>{captureError}</ReadOnlyNotice> : null}
      {state.phase === 'denied' && state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
      {isUnresolved ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả hoặc có thao tác đang chờ đối chiếu. Không gửi lại; hãy kiểm tra từ hệ thống trước khi thử lại.</ReadOnlyNotice>
      ) : null}
      {fromProposal ? (
        <TouchableOpacity
          testID="after-return-proposal"
          accessibilityRole="button"
          accessibilityLabel="Quay lại đề xuất phát sinh"
          accessibilityHint="Trở về màn đề xuất, giữ nguyên bản nháp đang soạn"
          onPress={returnToProposal}
          style={{
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
            minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>‹ Quay lại đề xuất</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        testID="task-handover-link"
        accessibilityRole="button"
        accessibilityLabel="Xem bước bàn giao"
        disabled={!handoverAllowed}
        onPress={() => { if (handoverAllowed) navigation.navigate('CompletionRequest'); }}
        style={{
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
          minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md, opacity: !handoverAllowed ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Xem bàn giao ›</Text>
      </TouchableOpacity>
    </TaskScreenShell>
  );
}
