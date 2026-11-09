import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import type { CameraOrderAsset } from './arrival-proof-controller';
import type { CheckInFaceChallenge } from '../../../api/orders.api';

type Challenge = NonNullable<CheckInFaceChallenge['challenge']>;

/** Hướng dẫn ngay trên khung camera: ảnh 1 nhìn thẳng, ảnh 2 làm động tác server yêu cầu (quay trái, phải, ngẩng, cúi). */
export const FACE_STEP_TEXT = {
  plain: 'Nhìn thẳng vào camera, giữ mặt bình thường',
  turn_left: 'Quay mặt sang trái',
  turn_right: 'Quay mặt sang phải',
  look_up: 'Ngẩng mặt lên trên',
  look_down: 'Cúi mặt xuống dưới',
} as const;

/** Kích thước thật của ảnh vừa chụp; nếu không đọc được thì 1 (server vẫn kiểm tra ảnh). */
async function sizeOf(uri: string): Promise<number> {
  try {
    const blob = await (await fetch(uri)).blob();
    return blob.size > 0 ? blob.size : 1;
  } catch {
    return 1;
  }
}

/**
 * Một lần mở camera trước cho cả hai ảnh check-in: ảnh 1 nhìn thẳng, rồi chuyển luôn sang thử thách
 * (quay trái, phải, ngẩng hoặc cúi) mà không phải mở lại camera. Ảnh chỉ nằm trong bộ nhớ máy cho tới khi gửi.
 */
/** `both`: hai ảnh liền nhau; `plain` hoặc `challenge`: chỉ chụp lại đúng ảnh đó. */
export type FaceCameraMode = 'both' | 'plain' | 'challenge';
export interface FaceCameraResult { plain?: CameraOrderAsset; second?: CameraOrderAsset }

export default function FaceLivenessCamera({
  challenge, mode = 'both', onDone, onCancel,
}: {
  challenge: Challenge;
  mode?: FaceCameraMode;
  onDone: (result: FaceCameraResult) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<InstanceType<typeof CameraView>>(null);
  const [first, setFirst] = useState<CameraOrderAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Một ảnh riêng lẻ (chụp lại) không có "bước 2"; chế độ both thì đi tuần tự.
  const step = mode === 'challenge' || (mode === 'both' && first) ? 2 : 1;
  const single = mode !== 'both';
  const instruction = step === 2 ? FACE_STEP_TEXT[challenge] : FACE_STEP_TEXT.plain;

  const shoot = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) throw new Error('empty');
      const asset: CameraOrderAsset = {
        source: 'camera', uri: shot.uri, name: `face-${step}-${Date.now()}.jpg`, type: 'image/jpeg', sizeBytes: await sizeOf(shot.uri),
      };
      if (!mounted.current) return;
      if (mode === 'plain') onDone({ plain: asset });
      else if (mode === 'challenge') onDone({ second: asset });
      else if (first) onDone({ plain: first, second: asset });
      else setFirst(asset);
    } catch {
      if (mounted.current) setError('Chưa chụp được ảnh. Hãy thử lại.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.root}>
        {permission?.granted ? (
          <CameraView ref={camera} testID="face-live-camera" style={StyleSheet.absoluteFill} facing="front" />
        ) : (
          <View style={styles.center}>
            <Text style={styles.text}>Cho phép camera để chụp ảnh khuôn mặt check-in.</Text>
            <TouchableOpacity
              testID="face-live-permission"
              accessibilityRole="button"
              disabled={permission?.canAskAgain === false}
              onPress={() => { void requestPermission(); }}
              style={styles.permission}
            >
              <Text style={styles.permissionText}>{permission?.canAskAgain === false ? 'Hãy cấp quyền camera trong Cài đặt' : 'Cho phép camera'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.top} pointerEvents="box-none">
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng camera" onPress={onCancel} style={styles.close}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.card} accessibilityLiveRegion="polite">
            <Text style={styles.step}>{single ? 'Chụp lại ảnh' : `Bước ${step}/2`}</Text>
            <Text testID="face-live-instruction" style={styles.instruction}>{instruction}</Text>
          </View>
        </View>

        <View style={styles.guide} pointerEvents="none" />

        <View style={styles.bottom}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <View style={styles.thumbSlot}>
              {first && !single ? (
                <TouchableOpacity testID="face-live-retake-first" accessibilityRole="button" accessibilityLabel="Chụp lại ảnh thứ nhất" disabled={busy} onPress={() => setFirst(null)}>
                  <Image source={{ uri: first.uri }} style={styles.thumb} accessibilityLabel="Ảnh thứ nhất đã chụp" />
                  <Text style={styles.thumbHint}>Chụp lại</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              testID="face-live-shutter"
              accessibilityRole="button"
              accessibilityLabel={step === 1 ? 'Chụp ảnh nhìn thẳng' : 'Chụp ảnh thử thách'}
              accessibilityState={{ disabled: busy || !permission?.granted, busy }}
              disabled={busy || !permission?.granted}
              onPress={() => { void shoot(); }}
              style={[styles.shutter, (busy || !permission?.granted) && { opacity: 0.5 }]}
            >
              {busy ? <ActivityIndicator color="#111111" /> : <View style={styles.shutterInner} />}
            </TouchableOpacity>
            <View style={styles.thumbSlot} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  permission: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center' },
  permissionText: { color: '#111111', fontWeight: '700' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: 16, gap: 12 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 14, padding: 14, gap: 4 },
  step: { color: '#BFDBFE', fontSize: 13, fontWeight: '700' },
  instruction: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', lineHeight: 28 },
  guide: { position: 'absolute', alignSelf: 'center', top: '24%', width: 240, height: 320, borderRadius: 160, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderStyle: 'dashed' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, gap: 12 },
  error: { color: '#FECACA', textAlign: 'center', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumbSlot: { width: 64, minHeight: 56 },
  thumb: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF' },
  thumbHint: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: '#111111' },
});
