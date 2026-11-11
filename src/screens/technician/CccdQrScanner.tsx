import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CircleAlert, Info } from 'lucide-react-native';
import { useAppTheme, type ThemeColors } from '../../constants/theme';
import ToneNote from '../../components/ToneNote';

const SLOW_SCAN_MS = 8000;

/**
 * Chỉ trình bày camera; màn cha tự phân tích chuỗi QR. `onScan` trả `false` khi chuỗi không phải
 * QR CCCD: màn này báo lỗi và cho quét lại.
 */
export function CccdQrScanner({ onScan, onCancel }: { onScan: (raw: string) => boolean; onCancel: () => void }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [invalid, setInvalid] = useState(false);
  const [slow, setSlow] = useState(false);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Thẻ mẫu cũ không có QR nên camera sẽ không bao giờ đọc được; báo sớm thay vì để người dùng chờ.
  useEffect(() => {
    if (!permission?.granted) return;
    const wait = setTimeout(() => setSlow(true), SLOW_SCAN_MS);
    return () => clearTimeout(wait);
  }, [permission?.granted]);
  const denied = permission?.canAskAgain === false && !permission.granted;

  return (
    <View style={styles.wrap}>
      {permission?.granted ? (
        <>
          <View style={styles.camera}>
            <CameraView
              testID="cccd-camera-view"
              accessibilityLabel="Camera quét mã QR trên thẻ"
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (locked.current || !data.trim()) return;
                locked.current = true;
                if (onScan(data)) return;
                setInvalid(true);
                // Chờ một nhịp rồi mới nhận lần quét tiếp, tránh báo lỗi liên tục khi camera còn hướng vào mã cũ.
                timer.current = setTimeout(() => { locked.current = false; }, 1500);
              }}
            />
            <View pointerEvents="none" style={styles.frame} />
          </View>
          <View style={styles.hints}>
            <Text style={styles.hintTitle}>Đưa mã QR vào khung, cách thẻ khoảng 10–15 cm.</Text>
            <Text style={styles.hint}>CCCD gắn chip: mã QR ở mặt trước, góc phải trên.</Text>
            <Text style={styles.hint}>Thẻ căn cước mới (từ 07/2024): mã QR ở mặt sau.</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Cho phép camera để quét mã QR trên thẻ CCCD gắn chip hoặc thẻ căn cước mới, hệ thống sẽ tự điền thông tin.
          </Text>
          {!denied && (
            <TouchableOpacity
              testID="cccd-camera-permission"
              accessibilityRole="button"
              style={styles.primaryBtn}
              onPress={() => { void requestPermission(); }}
            >
              <Text style={styles.primaryBtnText}>Cho phép camera</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      {invalid && (
        <ToneNote tone="danger" icon={CircleAlert} alert>
          Đây không phải mã QR trên thẻ căn cước. Hãy quét mã QR trên thẻ, hoặc nhập thủ công.
        </ToneNote>
      )}
      {slow && !invalid && (
        <ToneNote tone="warning" icon={Info} alert>
          Chưa thấy mã QR. CCCD mẫu cũ (không gắn chip) không có mã QR, bạn hãy nhập thủ công.
        </ToneNote>
      )}
      {denied && (
        <>
          <ToneNote tone="danger" icon={CircleAlert} alert>
            Quyền camera đã bị từ chối. Bạn có thể bật lại trong phần cài đặt, hoặc nhập thông tin thủ công.
          </ToneNote>
          <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={() => { void Linking.openSettings(); }}>
            <Text style={styles.secondaryBtnText}>Mở cài đặt</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity testID="cccd-camera-cancel" accessibilityRole="button" style={styles.secondaryBtn} onPress={onCancel}>
        <Text style={styles.secondaryBtnText}>Nhập thủ công</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 16 },
    camera: { height: 260, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000000' },
    // Khung ngắm: chỉ hướng dẫn, không ảnh hưởng vùng quét.
    frame: {
      position: 'absolute',
      alignSelf: 'center',
      top: 40,
      width: 180,
      height: 180,
      borderRadius: 16,
      borderWidth: 3,
      borderColor: '#FFFFFF',
    },
    hints: { gap: 4 },
    hintTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
    hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    body: { fontSize: 16, lineHeight: 24, color: colors.text },
    primaryBtn: {
      minHeight: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryStrong,
      paddingHorizontal: 16,
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    secondaryBtn: {
      minHeight: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
    },
    secondaryBtnText: { fontSize: 16, fontWeight: '600', color: colors.primaryStrong },
  });
