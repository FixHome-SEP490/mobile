// src/screens/technician/TechnicianKycScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, Camera, Clock, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react-native';
import { fontSize, spacing, useAppTheme, type Tone } from '../../constants/theme';
import {
  technicianVerificationApi,
  type KycDocumentType,
  type KycMimeType,
  type MyVerification,
  type SubmitDocumentPayload,
} from '../../api/technician-verification.api';
import BackButton from '../../components/BackButton';

const ALLOWED_MIME_TYPES: KycMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<KycMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function inferMimeType(asset: ImagePicker.ImagePickerAsset): KycMimeType | null {
  if (asset.mimeType && ALLOWED_MIME_TYPES.includes(asset.mimeType as KycMimeType)) {
    return asset.mimeType as KycMimeType;
  }
  const ext = asset.uri.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

interface KycSlot {
  key: 'front' | 'back' | 'face';
  documentType: KycDocumentType;
  label: string;
  hint: string;
  asset: ImagePicker.ImagePickerAsset | null;
  mimeType: KycMimeType | null;
}

const INITIAL_SLOTS: KycSlot[] = [
  {
    key: 'front',
    documentType: 'citizen_id_front',
    label: 'Mặt trước',
    hint: 'Chọn hoặc chụp',
    asset: null,
    mimeType: null,
  },
  {
    key: 'back',
    documentType: 'citizen_id_back',
    label: 'Mặt sau',
    hint: 'Chọn hoặc chụp',
    asset: null,
    mimeType: null,
  },
  {
    key: 'face',
    documentType: 'face_photo',
    label: 'Chân dung',
    hint: 'Bấm để mở camera',
    asset: null,
    mimeType: null,
  },
];

/** Professional certificates are optional, several photos, from notarised copies (PO 08/10/2026). */
const MAX_CERTIFICATES = 5;
export const OFFICE_VISIT_NOTE = 'Vui lòng đến trụ sở trong thời gian sớm nhất để tiến hành xác minh thông tin và bắt đầu công việc.';

export default function TechnicianKycScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<MyVerification | null>(null);
  const [slots, setSlots] = useState<KycSlot[]>(INITIAL_SLOTS);
  const [certificates, setCertificates] = useState<{ asset: ImagePicker.ImagePickerAsset; mimeType: KycMimeType }[]>([]);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadVerification = useCallback(() => {
    technicianVerificationApi
      .getMyVerification()
      .then((result) => {
        if (!aliveRef.current) return;
        setVerification(result);
        setLoadError(false);
      })
      .catch(() => {
        // A failed load must not fall through to the upload form as if nothing was submitted.
        if (aliveRef.current) setLoadError(true);
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadVerification();
  }, [loadVerification]);

  const retryLoad = () => {
    setLoadError(false);
    setLoading(true);
    loadVerification();
  };

  const applyAsset = (key: KycSlot['key'], asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = inferMimeType(asset);
    if (!mimeType) {
      Alert.alert('Ảnh không hợp lệ', 'Chỉ nhận ảnh định dạng JPEG, PNG hoặc WebP.');
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      Alert.alert('Ảnh quá lớn', 'Ảnh vượt quá 10MB. Vui lòng chọn ảnh khác.');
      return;
    }
    setSlots((prev) =>
      prev.map((slot) => (slot.key === key ? { ...slot, asset, mimeType } : slot)),
    );
  };

  const pickFromLibrary = async (key: 'front' | 'back') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Cần quyền truy cập',
        'Vui lòng cấp quyền thư viện ảnh trong Cài đặt để chọn ảnh CCCD.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    if (!result.canceled && result.assets[0]) applyAsset(key, result.assets[0]);
  };

  const pickFromCamera = async (key: KycSlot['key'], front: boolean) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền camera trong Cài đặt để chụp ảnh.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
      cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets[0]) applyAsset(key, result.assets[0]);
  };

  const handleSlotPress = (slot: KycSlot) => {
    if (slot.key === 'face') {
      pickFromCamera('face', true);
      return;
    }
    const key = slot.key;
    Alert.alert('Ảnh CCCD/CMND', 'Chọn nguồn ảnh', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Thư viện ảnh', onPress: () => pickFromLibrary(key) },
      { text: 'Chụp ảnh', onPress: () => pickFromCamera(key, false) },
    ]);
  };

  const addCertificate = async () => {
    if (certificates.length >= MAX_CERTIFICATES) {
      Alert.alert('Đủ số ảnh', `Tối đa ${MAX_CERTIFICATES} ảnh chứng chỉ.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh trong Cài đặt để chọn ảnh chứng chỉ.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    const asset = !result.canceled ? result.assets[0] : null;
    if (!asset) return;
    const mimeType = inferMimeType(asset);
    if (!mimeType) {
      Alert.alert('Ảnh không hợp lệ', 'Chỉ nhận ảnh định dạng JPEG, PNG hoặc WebP.');
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      Alert.alert('Ảnh quá lớn', 'Ảnh vượt quá 10MB. Vui lòng chọn ảnh khác.');
      return;
    }
    setCertificates((prev) => [...prev, { asset, mimeType }]);
  };

  const canSubmit = slots.every((slot) => slot.asset && slot.mimeType);
  const hasAnySelection = slots.some((slot) => slot.asset !== null);

  const resetSlots = () => { setSlots(INITIAL_SLOTS); setCertificates([]); };

  const uploadSlot = async (slot: KycSlot): Promise<SubmitDocumentPayload> => {
    if (!slot.asset || !slot.mimeType) throw new Error(`Thiếu ảnh cho ${slot.label}`);
    const { storageObjectPath, uploadUrl } = await technicianVerificationApi.requestUploadUrl(
      slot.mimeType,
    );
    await technicianVerificationApi.uploadToSignedUrl(uploadUrl, slot.mimeType, {
      uri: slot.asset.uri,
    });
    return {
      documentType: slot.documentType,
      storageObjectPath,
      fileName: `${slot.key}.${MIME_EXTENSIONS[slot.mimeType]}`,
      fileSize: slot.asset.fileSize ?? 0,
      mimeType: slot.mimeType,
    };
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const documents = await Promise.all(slots.map(uploadSlot));
      const certificateDocuments = await Promise.all(certificates.map(async (cert, index): Promise<SubmitDocumentPayload> => {
        const { storageObjectPath, uploadUrl } = await technicianVerificationApi.requestUploadUrl(cert.mimeType);
        await technicianVerificationApi.uploadToSignedUrl(uploadUrl, cert.mimeType, { uri: cert.asset.uri });
        return {
          documentType: 'certificate',
          storageObjectPath,
          fileName: `certificate-${index + 1}.${MIME_EXTENSIONS[cert.mimeType]}`,
          fileSize: cert.asset.fileSize ?? 0,
          mimeType: cert.mimeType,
        };
      }));
      const result = await technicianVerificationApi.submit([...documents, ...certificateDocuments]);
      setVerification(result);
      Alert.alert('Đã nộp hồ sơ', OFFICE_VISIT_NOTE);
    } catch (err) {
      Alert.alert(
        'Không thể nộp hồ sơ',
        (err as Error)?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showUploadForm = !loadError && (!verification || verification.status === 'REJECTED');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerEyebrow}>Xác minh danh tính</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Hồ sơ rõ, việc vững</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.bodySmall}>Theo dõi hồ sơ và cung cấp ảnh để xác minh danh tính của bạn.</Text>
        {loading ? (
          <View style={styles.centerBlock} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
            <ActivityIndicator color={colors.primaryStrong} />
            <Text style={styles.bodySmall}>Đang tải…</Text>
            <Text style={styles.bodySmall}>Đang kiểm tra trạng thái hồ sơ của bạn.</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerBlock}>
            <AlertTriangle size={40} color={colors.error} strokeWidth={1.5} />
            <Text style={styles.errorText} accessibilityRole="alert">Không thể tải trạng thái xác minh. Vui lòng thử lại.</Text>
            <Text style={styles.bodySmall}>Chưa xác định được tình trạng hồ sơ của bạn.</Text>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={retryLoad}
              accessibilityRole="button"
              accessibilityLabel="Thử lại trạng thái xác minh"
              accessibilityHint="Kiểm tra lại tình trạng hồ sơ, không gửi ảnh."
            >
              <Text style={styles.secondaryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {verification?.status === 'PENDING' && (
              <StatusCard
                styles={styles}
                tone={colors.tone.warning}
                Icon={Clock}
                title="Đang chờ duyệt"
                body={`Hồ sơ của bạn đã được nộp và đang chờ quản trị viên xác minh. ${OFFICE_VISIT_NOTE}`}
              />
            )}

            {verification?.status === 'VERIFIED' && (
              <StatusCard
                styles={styles}
                tone={colors.tone.success}
                Icon={ShieldCheck}
                title="Đã xác minh danh tính"
                body="Thông tin xác minh danh tính đã được duyệt."
              />
            )}

            {verification?.status === 'REJECTED' && (
              <StatusCard
                styles={styles}
                tone={colors.tone.danger}
                Icon={XCircle}
                title="Hồ sơ bị từ chối"
                body={verification.rejectionReason || 'Quản trị viên chưa cung cấp lý do chi tiết. Bạn có thể cập nhật hồ sơ và nộp lại.'}
              />
            )}

            {showUploadForm && (
              <View style={styles.form}>
                {!verification && <Text style={styles.statusLabel} accessibilityRole="header">Chưa nộp hồ sơ</Text>}
                <Text style={styles.formTitle} accessibilityRole="header">
                  {verification?.status === 'REJECTED' ? 'Chọn ảnh để nộp lại' : 'Chuẩn bị 3 ảnh xác minh'}
                </Text>
                <Text style={styles.bodySmall}>
                  Chụp rõ toàn bộ hai mặt CCCD và khuôn mặt, không che thông tin. Ảnh chân dung là ảnh tĩnh.
                </Text>
                <Text style={styles.caption}>Ảnh JPEG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.</Text>

                {slots.map((slot) => {
                  const displayLabel = slot.key === 'front'
                    ? 'CCCD mặt trước'
                    : slot.key === 'back'
                      ? 'CCCD mặt sau'
                      : 'Ảnh chân dung';
                  const displayHint = slot.key === 'face' ? 'Chụp ảnh chân dung tĩnh' : 'Chọn ảnh có sẵn hoặc chụp mới';

                  return (
                    <TouchableOpacity
                      key={slot.key}
                      style={[styles.slotCard, slot.asset && styles.slotCardFilled]}
                      onPress={() => handleSlotPress(slot)}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={`${displayLabel}, ${slot.asset ? 'đã chọn ảnh trên máy' : 'chưa chọn ảnh'}`}
                      accessibilityHint={`${slot.asset ? 'Ảnh này chưa nộp. Bấm để đổi ảnh.' : displayHint + '.'}`}
                      accessibilityState={{ disabled: submitting }}
                    >
                      <View style={styles.slotThumb}>
                        {slot.asset ? (
                          <Image source={{ uri: slot.asset.uri }} style={styles.slotImage} accessibilityIgnoresInvertColors accessible={false} />
                        ) : (
                          <Camera size={26} color={colors.textSecondary} strokeWidth={1.75} />
                        )}
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.slotLabel}>{displayLabel}</Text>
                        <Text style={styles.bodySmall}>{slot.asset ? 'Đã chọn ảnh trên máy' : displayHint}</Text>
                        {slot.asset && <Text style={styles.caption}>Bấm để đổi ảnh</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <Text style={styles.slotLabel}>Chứng chỉ nghề (không bắt buộc)</Text>
                <Text style={[styles.bodySmall, { color: colors.tone.warning.fg }]}>Ảnh chứng chỉ phải chụp từ bản đã công chứng. Tối đa {MAX_CERTIFICATES} ảnh.</Text>
                <View style={[styles.actionRow, { flexWrap: 'wrap' }]}>
                  {certificates.map((cert, index) => (
                    <TouchableOpacity
                      key={cert.asset.uri}
                      style={styles.slotThumb}
                      onPress={() => setCertificates((prev) => prev.filter((_, i) => i !== index))}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={`Chứng chỉ ${index + 1}, bấm để bỏ`}
                    >
                      <Image source={{ uri: cert.asset.uri }} style={styles.slotImage} accessibilityIgnoresInvertColors />
                    </TouchableOpacity>
                  ))}
                  {certificates.length < MAX_CERTIFICATES && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={addCertificate} disabled={submitting} accessibilityRole="button" accessibilityLabel="Thêm ảnh chứng chỉ nghề">
                      <Text style={styles.secondaryBtnText}>+ Thêm ảnh chứng chỉ</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.bodySmall} accessibilityLiveRegion="polite">
                  {canSubmit ? 'Đã chọn đủ 3 ảnh trên máy. Bạn có thể nộp hồ sơ.' : 'Chọn đủ 3 ảnh để nộp hồ sơ.'}
                </Text>
                <Text style={styles.caption}>Ảnh đã chọn chưa được nộp. Hồ sơ chỉ được ghi nhận sau khi gửi thành công.</Text>
                <View style={styles.actionRow}>
                  {hasAnySelection && (
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      disabled={submitting}
                      onPress={resetSlots}
                      accessibilityRole="button"
                      accessibilityLabel="Chọn lại cả 3 ảnh"
                      accessibilityHint="Xóa lựa chọn ảnh trên máy để chọn lại; không thay đổi hồ sơ đã nộp."
                      accessibilityState={{ disabled: submitting }}
                    >
                      <Text style={styles.secondaryBtnText}>Chọn lại</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      (!canSubmit || submitting) && styles.submitBtnDisabled,
                    ]}
                    disabled={!canSubmit || submitting}
                    onPress={handleSubmit}
                    accessibilityRole="button"
                    accessibilityLabel="Nộp hồ sơ xác minh"
                    accessibilityHint={canSubmit ? 'Gửi 3 ảnh đã chọn để quản trị viên xét duyệt hồ sơ.' : 'Chọn đủ 3 ảnh trước khi nộp hồ sơ.'}
                    accessibilityState={{ disabled: !canSubmit || submitting, busy: submitting }}
                  >
                    {submitting ? (
                      <>
                        <ActivityIndicator color={colors.textSecondary} />
                        <Text style={[styles.primaryBtnText, styles.disabledBtnText]}>Đang gửi hồ sơ…</Text>
                      </>
                    ) : (
                      <Text style={[styles.primaryBtnText, !canSubmit && styles.disabledBtnText]}>Nộp hồ sơ xác minh</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type KycStyles = ReturnType<typeof getStyles>;

function StatusCard({ styles, tone, Icon, title, body }: {
  styles: KycStyles;
  tone: Tone;
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <View
      style={[styles.statusCard, { backgroundColor: tone.bg }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <Icon size={22} color={tone.fg} strokeWidth={1.75} />
      <View style={styles.flex1}>
        <Text style={[styles.statusTitle, { color: tone.text }]} accessibilityRole="header">{title}</Text>
        <Text style={[styles.statusBody, { color: tone.text }]}>{body}</Text>
      </View>
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitleGroup: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  headerEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  centerBlock: { alignItems: 'center', gap: 12, marginTop: spacing.xl },
  bodySmall: { fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary },
  caption: { fontSize: fontSize.xs, lineHeight: 16, color: colors.textSecondary },
  statusLabel: { fontSize: fontSize.md, lineHeight: 24, fontWeight: '600', color: colors.textSecondary },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.error, textAlign: 'center' },
  statusCard: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 16 },
  statusTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  statusBody: { fontSize: 14, lineHeight: 20 },
  form: { gap: spacing.md },
  formTitle: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: '600', color: colors.text },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 88,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotCardFilled: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  slotThumb: {
    width: 72,
    height: 72,
    flexShrink: 0,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotImage: { width: '100%', height: '100%' },
  slotLabel: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  actionRow: { gap: spacing.sm, marginTop: spacing.xs },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryBtnText: { flexShrink: 1, textAlign: 'center', color: colors.surface, fontSize: fontSize.md, lineHeight: 24, fontWeight: '600' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: { textAlign: 'center', color: colors.text, fontSize: fontSize.md, lineHeight: 24, fontWeight: '600' },
  submitBtnDisabled: { backgroundColor: colors.border },
  disabledBtnText: { color: colors.textSecondary },
});
