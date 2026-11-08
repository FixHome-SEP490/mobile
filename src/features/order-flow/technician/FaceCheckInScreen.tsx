import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder, ordersApi, type CheckInFaceChallenge } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
import { captureCameraPhoto, confirmCameraPermission } from './camera-capture';
import { devFacePlaceholder } from './dev-face-skip';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { backFromFlow } from '../navigation/resume-order';

/** T05 — EN_ROUTE with own arrival, no own confirmed face. Camera-only private capture. */
export default function FaceCheckInScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianArrivalProof();
  const navigation = useNavigation<any>();
  // Capture draft is keyed by session/order owner: revocation or reassignment
  // hides it without an effect-driven reset. Local memory only, never persisted.
  const [draft, setDraft] = useState<{
    owner: string | null; asset: CameraOrderAsset | null; error: string | null;
    /** Liveness: the server's random challenge and the second photo that does it. */
    challenge?: CheckInFaceChallenge | null; second?: CameraOrderAsset | null;
  }>({
    owner: null,
    asset: null,
    error: null,
  });
  const [capturing, setCapturing] = useState(false);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  // A foreground refresh drops the order to 'loading' for a moment; that is not a revocation, so keep the draft.
  const orderLoading = snapshot?.order.status === 'loading';
  const revoked = !snapshot || snapshot.access !== 'current' || !key || (!orderLoading && (!order || !assignmentValid));
  const owner = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const evidenceReady = snapshot?.resources.evidence.status === 'ready';
  const evidenceLoading = snapshot?.resources.evidence.status === 'loading';
  const ownEvidence = evidenceReady && snapshot?.resources.evidence.status === 'ready'
    ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId)
    : [];
  const hasOwnFace = Array.isArray(ownEvidence) && ownEvidence.some(e => e.type === 'CHECKIN_FACE');
  const asset = !revoked && draft.owner === owner ? draft.asset : null;
  const captureError = !revoked && draft.owner === owner ? draft.error : null;
  const refreshing = snapshot?.order.status === 'loading' || evidenceLoading;
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying' || capturing;
  const hasPendingIntent = snapshot?.pendingIntent === true;
  const isUnresolved = state.phase === 'unknown' || hasPendingIntent;
  const canVerify = !revoked && !busy && isUnresolved;
  const canCapture = !revoked && !busy && !isUnresolved && !!evidenceReady && !hasOwnFace && order?.arrivalVerified === true && order?.status === 'EN_ROUTE';
  const challenge = !revoked && draft.owner === owner ? draft.challenge ?? null : null;
  const second = !revoked && draft.owner === owner ? draft.second ?? null : null;
  const needSecond = !!asset && !!challenge?.challenge && !second;
  const canSend = canCapture && !!asset && !needSecond;

  const capture = async () => {
    if (!canCapture || capturing) return;
    setCapturing(true);
    setDraft({ owner, asset: null, error: null });
    try {
      // A new plain photo starts a new liveness attempt with a fresh challenge from the server.
      const issued = key ? await ordersApi.getCheckInFaceChallenge(key.serviceOrderId) : { challenge: null };
      const result = await captureCameraPhoto();
      if (!result.ok) {
        setDraft({ owner, asset: null, error: result.reason === 'cancelled' ? null : result.message });
        return;
      }
      setDraft({ owner, asset: result.asset, error: null, challenge: issued, second: null });
    } catch {
      setDraft({ owner, asset: null, error: 'Chưa chụp được ảnh. Hãy thử lại.' });
    } finally {
      setCapturing(false);
    }
  };

  const captureSecond = async () => {
    if (!needSecond || capturing) return;
    setCapturing(true);
    try {
      const result = await captureCameraPhoto();
      if (!result.ok) {
        setDraft(d => ({ ...d, error: result.reason === 'cancelled' ? null : result.message }));
        return;
      }
      setDraft(d => ({ ...d, second: result.asset, error: null }));
    } catch {
      setDraft(d => ({ ...d, error: 'Chưa chụp được ảnh. Hãy thử lại.' }));
    } finally {
      setCapturing(false);
    }
  };

  const devSkip = async () => {
    if (!__DEV__ || !canCapture || capturing) return;
    setCapturing(true);
    try {
      void controller.uploadFace(await devFacePlaceholder());
    } catch {
      setDraft({ owner, asset: null, error: 'Không đọc được ảnh mẫu dev.' });
    } finally {
      setCapturing(false);
    }
  };

  const send = async () => {
    if (!canSend || !asset) return;
    if (!(await confirmCameraPermission())) {
      setDraft({ owner, asset: null, error: 'Quyền camera đã bị thu hồi trước khi gửi. Bản nháp đã được xóa; hãy chụp lại.' });
      return;
    }
    void controller.uploadFace(second && challenge?.token
      ? { ...asset, liveness: { token: challenge.token, image: { uri: second.uri, name: second.name, type: second.type } } }
      : asset);
  };

  const primaryLabel = capturing
    ? 'Đang mở camera…'
    : canVerify
      ? 'Kiểm tra lại'
      : needSecond
        ? 'Chụp ảnh thứ hai'
        : asset
          ? 'Gửi ảnh'
          : 'Chụp ảnh';

  return (
    <TaskScreenShell
      title="Chụp ảnh xác minh"
      stage={2}
      onBack={() => backFromFlow(navigation)}
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
        testID: canVerify ? 'face-verify' : needSecond ? 'face-capture-second' : asset ? 'face-send' : 'face-capture',
        disabled: canVerify ? false : needSecond ? !canCapture || capturing : asset ? !canSend : !canCapture,
        onPress: () => {
          if (revoked || busy) return;
          if (canVerify) {
            void controller.verify();
            return;
          }
          if (needSecond) void captureSecond();
          else if (asset) void send();
          else if (canCapture) void capture();
        },
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Địa chỉ" value={order?.addressSummary} />
        <DetailRow label="Ảnh khuôn mặt" value={hasOwnFace ? 'Máy chủ đã xác nhận' : 'Chưa có ảnh được xác nhận'} />
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Bản nháp ảnh đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : !evidenceReady ? (
        <ReadOnlyNotice>Đang tải danh sách ảnh từ máy chủ. Mọi thao tác chụp và gửi đều khóa cho đến khi dữ liệu ảnh đầy đủ.</ReadOnlyNotice>
      ) : hasOwnFace ? (
        <ReadOnlyNotice>Ảnh xác minh đã được máy chủ xác nhận. Đang tải trạng thái mới; không cần gửi lại.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>Hãy chụp ảnh khuôn mặt của bạn bằng camera để máy chủ xác minh. Ảnh chỉ xem trước trên máy trước khi bạn nhấn gửi. Ảnh đầu: nhìn thẳng, giữ mặt bình thường. Sau đó hệ thống sẽ yêu cầu thêm một ảnh quay đầu hoặc mỉm cười để xác nhận bạn đang có mặt.</ReadOnlyNotice>
      )}
      {asset && !hasOwnFace ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Đã chụp xong. Kiểm tra kỹ rồi mới gửi.</Text>
          <Image
            testID="face-preview"
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: colors.border }}
            resizeMode="cover"
            accessibilityLabel="Ảnh khuôn mặt vừa chụp"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              testID="face-retake"
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
              testID="face-cancel"
              accessibilityRole="button"
              accessibilityLabel="Hủy ảnh vừa chụp"
              disabled={busy}
              onPress={() => {
                setDraft({ owner, asset: null, error: null });
              }}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Hủy ảnh</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {needSecond ? (
        <ReadOnlyNotice>
          {challenge?.challenge === 'smile'
            ? 'Bước 2/2: hãy mỉm cười rồi chụp ảnh thứ hai.'
            : 'Bước 2/2: hãy quay mặt sang một bên (trái hoặc phải) rồi chụp ảnh thứ hai.'}
        </ReadOnlyNotice>
      ) : null}
      {second && !hasOwnFace ? (
        <Image
          testID="face-preview-second"
          source={{ uri: second.uri }}
          style={{ width: '100%', height: 160, borderRadius: 10, backgroundColor: colors.border }}
          resizeMode="cover"
          accessibilityLabel="Ảnh khuôn mặt thứ hai vừa chụp"
        />
      ) : null}
      {__DEV__ && canCapture && !asset ? (
        <TouchableOpacity
          testID="face-dev-skip"
          accessibilityRole="button"
          accessibilityLabel="Bỏ qua chụp ảnh mặt (chỉ bản dev)"
          disabled={busy}
          onPress={() => void devSkip()}
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, opacity: busy ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Bỏ qua chụp ảnh mặt (chỉ bản dev)</Text>
        </TouchableOpacity>
      ) : null}
      {captureError ? <ReadOnlyNotice>{captureError}</ReadOnlyNotice> : null}
      {state.phase === 'denied' && state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
      {isUnresolved ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả hoặc có thao tác đang chờ đối chiếu. Không gửi lại; hãy kiểm tra từ hệ thống trước khi thử lại.</ReadOnlyNotice>
      ) : null}
      {state.phase === 'resolved' ? (
        <ReadOnlyNotice>Đã gửi ảnh. Đang chờ máy chủ xác nhận; trạng thái mới sẽ tự cập nhật sau khi làm mới.</ReadOnlyNotice>
      ) : null}
      <TechnicianOrderHub />
    </TaskScreenShell>
  );
}
