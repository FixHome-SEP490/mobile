import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
import { captureCameraPhoto, confirmCameraPermission } from './camera-capture';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/**
 * T06 — EN_ROUTE with own arrival and face, BEFORE still below the attested
 * minimum. Also hosts the manual BEFORE capture route used from TR recovery.
 * Frozen upload/delete guards decide; one confirmed upload never claims the
 * minimum is satisfied. Safe Next/refresh never sends start-repair.
 */
export default function BeforeEvidenceScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianArrivalProof();
  const navigation = useNavigation<any>();
  // Capture and delete drafts are keyed by session/order owner: revocation or
  // reassignment hides them without an effect-driven reset. Memory only.
  const [draft, setDraft] = useState<{ owner: string | null; asset: CameraOrderAsset | null; error: string | null; confirmDeleteId: string | null }>({
    owner: null,
    asset: null,
    error: null,
    confirmDeleteId: null,
  });
  const [capturing, setCapturing] = useState(false);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const owner = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const evidenceReady = snapshot?.resources.evidence.status === 'ready';
  const evidenceLoading = snapshot?.resources.evidence.status === 'loading';
  const ownEvidence = evidenceReady && snapshot?.resources.evidence.status === 'ready'
    ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId)
    : [];
  const ownBefore = Array.isArray(ownEvidence) ? ownEvidence.filter(e => e.type === 'BEFORE') : [];
  const hasOwnFace = Array.isArray(ownEvidence) && ownEvidence.some(e => e.type === 'CHECKIN_FACE');
  const asset = !revoked && draft.owner === owner ? draft.asset : null;
  const captureError = !revoked && draft.owner === owner ? draft.error : null;
  const confirmDeleteId = !revoked && draft.owner === owner ? draft.confirmDeleteId : null;
  const refreshing = snapshot?.order.status === 'loading' || evidenceLoading;
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying' || capturing;
  const hasPendingIntent = snapshot?.pendingIntent === true;
  const isUnresolved = state.phase === 'unknown' || hasPendingIntent;
  const canVerify = !revoked && !busy && isUnresolved;
  const canCapture = !revoked && !busy && !isUnresolved && !!evidenceReady && order?.arrivalVerified === true && hasOwnFace && order?.status === 'EN_ROUTE';
  const canSend = canCapture && !!asset;
  const isFixedPrice = order?.pricingMode?.toUpperCase() === 'FIXED_PRICE';

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
    if (!canSend || !asset) return;
    if (!(await confirmCameraPermission())) {
      setDraft({ owner, asset: null, error: 'Quyền camera đã bị thu hồi trước khi gửi. Bản nháp đã được xóa; hãy chụp lại.', confirmDeleteId: null });
      return;
    }
    void controller.uploadBefore(asset);
  };

  const askDelete = (evidenceId: string) => {
    if (!canCapture) return;
    setDraft({ owner, asset: null, error: null, confirmDeleteId: evidenceId });
  };

  const confirmDelete = (evidenceId: string) => {
    if (!canCapture) return;
    setDraft({ owner, asset: null, error: null, confirmDeleteId: null });
    void controller.deleteBefore(evidenceId, true);
  };

  const primaryLabel = capturing
    ? 'Đang mở camera…'
    : canVerify
      ? 'Kiểm tra lại'
      : asset
        ? 'Gửi ảnh'
        : 'Chụp ảnh';

  return (
    <TaskScreenShell
      title="Ảnh trước sửa chữa"
      stage={2}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: !canRefresh || busy,
        onPress: () => {
          if (canRefresh && !busy) {
            if (snapshot?.resources.evidence.status === 'unloaded') void loadResource('evidence');
            void refresh('manual');
          }
        },
      }}
      primary={{
        label: primaryLabel,
        testID: canVerify ? 'before-verify' : asset ? 'before-send' : 'before-capture',
        disabled: canVerify ? false : asset ? !canSend : !canCapture,
        onPress: () => {
          if (revoked || busy) return;
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
        <DetailRow label="Ảnh khuôn mặt" value={hasOwnFace ? 'Máy chủ đã xác nhận' : 'Chưa được xác nhận'} />
        <DetailRow label="Ảnh trước sửa chữa đã xác nhận" value={evidenceReady ? String(ownBefore.length) : 'Đang tải…'} />
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Bản nháp ảnh đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : !evidenceReady ? (
        <ReadOnlyNotice>Đang tải danh sách ảnh từ máy chủ. Mọi thao tác chụp, gửi và xóa đều khóa cho đến khi dữ liệu ảnh đầy đủ.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>
          Hãy chụp ảnh hiện trạng trước sửa chữa. Số ảnh yêu cầu do máy chủ quyết định; một ảnh đã gửi không đồng nghĩa đã đủ.
          {isFixedPrice ? ' Đơn giá cố định nên không cần báo giá; máy chủ tự bắt đầu sửa chữa khi đủ ảnh.' : null}
        </ReadOnlyNotice>
      )}
      {asset ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Đã chụp xong. Kiểm tra kỹ rồi mới gửi.</Text>
          <Image
            testID="before-preview"
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: colors.border }}
            resizeMode="cover"
            accessibilityLabel="Ảnh trước sửa chữa vừa chụp"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              testID="before-retake"
              accessibilityRole="button"
              accessibilityLabel="Chụp lại ảnh"
              disabled={busy}
              onPress={() => {
                void capture();
              }}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Chụp lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="before-cancel"
              accessibilityRole="button"
              accessibilityLabel="Hủy ảnh vừa chụp"
              disabled={busy}
              onPress={() => {
                setDraft({ owner, asset: null, error: null, confirmDeleteId: null });
              }}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Hủy ảnh</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {ownBefore.map(item => (
        <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 8 }}>
          <DetailRow label="Ảnh đã gửi" value={item.createdAt ? vnDateTimeString(item.createdAt) : item.id} />
          {confirmDeleteId === item.id ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>Xóa ảnh này khỏi đơn? Thao tác cần máy chủ xác nhận.</Text>
              <TouchableOpacity
                testID={`before-delete-confirm-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel="Xác nhận xóa ảnh"
                disabled={busy}
                onPress={() => confirmDelete(item.id)}
                style={{
                  minHeight: 52,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.error,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.error, fontWeight: '700', fontSize: 14, lineHeight: 20 }}>Xác nhận xóa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`before-delete-cancel-${item.id}`}
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
              testID={`before-delete-${item.id}`}
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
      {state.phase === 'resolved' ? (
        <ReadOnlyNotice>Đã ghi nhận. Đang chờ máy chủ xác nhận; số ảnh yêu cầu do máy chủ quyết định sau khi làm mới.</ReadOnlyNotice>
      ) : null}
      <TouchableOpacity
        testID="task-scope-link"
        accessibilityRole="button"
        disabled={revoked}
        onPress={() => {
          if (!revoked) navigation.navigate('ScopeDetail');
        }}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          minHeight: 52,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          opacity: revoked ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Tiếp tục: xem phạm vi ›</Text>
      </TouchableOpacity>
    </TaskScreenShell>
  );
}
