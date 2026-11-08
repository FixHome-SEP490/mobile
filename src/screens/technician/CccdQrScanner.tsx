import React, { useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lightTheme as colors, spacing } from '../../constants/theme';

/** Chỉ trình bày camera; kết quả quét trả về cho màn cha tự phân tích. */
export function CccdQrScanner({ onScan, onCancel }: { onScan: (raw: string) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);
  const denied = permission?.canAskAgain === false && !permission.granted;
  return (
    <View style={{ gap: spacing.sm }}>
      {permission?.granted ? (
        <CameraView
          testID="cccd-camera-view"
          style={{ height: 240 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current || !data.trim()) return;
            done.current = true;
            onScan(data);
          }}
        />
      ) : (
        <>
          <Text>Cho phép camera để quét mã QR trên mặt trước thẻ CCCD gắn chip, hệ thống sẽ tự điền thông tin.</Text>
          {!denied && (
            <TouchableOpacity
              testID="cccd-camera-permission"
              accessibilityRole="button"
              onPress={() => { void requestPermission(); }}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primaryStrong }}>Cho phép camera</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      {denied && <Text accessibilityRole="alert">Quyền camera đã bị từ chối. Bạn có thể nhập số CCCD thủ công.</Text>}
      <TouchableOpacity
        testID="cccd-camera-cancel"
        accessibilityRole="button"
        onPress={onCancel}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.primaryStrong }}>Đóng camera, nhập thủ công</Text>
      </TouchableOpacity>
    </View>
  );
}
