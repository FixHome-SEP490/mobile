import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** Camera presentation only. A scan fills the parent's ephemeral draft; never receives parts. */
export function PartsQrScanner({ onToken, onCancel }: { onToken: (token: string) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const scanned = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ask = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const result = await requestPermission();
      if (mounted.current && !result.granted) setError('Chưa có quyền camera. Bạn có thể nhập mã nhận hàng.');
    } catch { if (mounted.current) setError('Không mở được camera. Bạn có thể nhập mã nhận hàng.'); }
    finally { if (mounted.current) setRequesting(false); }
  };
  return <View style={{ gap: spacing.sm }}>
    {permission?.granted ? <CameraView testID="parts-camera-view" style={{ height: 240 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
      if (!mounted.current || scanned.current || !data.trim()) return;
      scanned.current = true;
      onToken(data);
    }} /> : <>
      <Text>Cho phép camera để quét mã QR nhận linh kiện.</Text>
      <TouchableOpacity testID="parts-camera-permission" accessibilityRole="button" accessibilityState={{ disabled: requesting || permission?.canAskAgain === false, busy: requesting }} disabled={requesting || permission?.canAskAgain === false} onPress={() => { void ask(); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.primaryStrong }}>{requesting ? 'Đang xin quyền…' : 'Cho phép camera'}</Text></TouchableOpacity>
    </>}
    {(error || permission?.canAskAgain === false && !permission.granted) && <Text accessibilityRole="alert">{error ?? 'Quyền camera đã bị từ chối. Bạn có thể nhập mã nhận hàng.'}</Text>}
    <TouchableOpacity testID="parts-camera-cancel" accessibilityRole="button" onPress={onCancel} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.primaryStrong }}>Đóng camera, nhập mã</Text></TouchableOpacity>
  </View>;
}
