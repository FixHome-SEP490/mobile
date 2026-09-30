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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, Camera, ChevronLeft, Clock, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react-native';
import type { RootStackParamList } from '../../types';
import { useAppTheme, type Tone } from '../../constants/theme';
import {
  technicianVerificationApi,
  type KycDocumentType,
  type KycMimeType,
  type MyVerification,
  type SubmitDocumentPayload,
} from '../../api/technician-verification.api';

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

export default function TechnicianKycScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<MyVerification | null>(null);
  const [slots, setSlots] = useState<KycSlot[]>(INITIAL_SLOTS);

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

  const canSubmit = slots.every((slot) => slot.asset && slot.mimeType);
  const hasAnySelection = slots.some((slot) => slot.asset !== null);

  const resetSlots = () => setSlots(INITIAL_SLOTS);

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
      const result = await technicianVerificationApi.submit(documents);
      setVerification(result);
      Alert.alert('Đã nộp hồ sơ', 'Vui lòng chờ quản trị viên duyệt hồ sơ xác minh của bạn.');
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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Xác minh danh tính</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={colors.primaryStrong} />
            <Text style={styles.bodySmall}>Đang tải…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerBlock}>
            <AlertTriangle size={40} color={colors.error} strokeWidth={1.5} />
            <Text style={styles.errorText}>Không thể tải trạng thái xác minh. Vui lòng thử lại.</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={retryLoad} accessibilityRole="button">
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
                body="Hồ sơ của bạn đã được nộp và đang chờ quản trị viên xác minh."
              />
            )}

            {verification?.status === 'VERIFIED' && (
              <StatusCard
                styles={styles}
                tone={colors.tone.success}
                Icon={ShieldCheck}
                title="Đã xác minh danh tính"
                body="Bạn có thể nhận việc bình thường."
              />
            )}

            {verification?.status === 'REJECTED' && (
              <StatusCard
                styles={styles}
                tone={colors.tone.danger}
                Icon={XCircle}
                title="Hồ sơ bị từ chối"
                body={verification.rejectionReason || 'Ảnh không hợp lệ. Vui lòng nộp lại.'}
              />
            )}

            {showUploadForm && (
              <View style={styles.form}>
                <Text style={styles.formTitle}>Nộp ảnh xác minh</Text>
                <Text style={styles.bodySmall}>Ảnh JPEG, PNG hoặc WebP, tối đa 10MB mỗi ảnh.</Text>

                {slots.map((slot) => (
                  <TouchableOpacity
                    key={slot.key}
                    style={[styles.slotCard, slot.asset && styles.slotCardFilled]}
                    onPress={() => handleSlotPress(slot)}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.label}${slot.asset ? ', đã chọn ảnh. Bấm để đổi ảnh' : ', ' + slot.hint}`}
                  >
                    <View style={styles.slotThumb}>
                      {slot.asset ? (
                        <Image source={{ uri: slot.asset.uri }} style={styles.slotImage} accessibilityIgnoresInvertColors />
                      ) : (
                        <Camera size={26} color={colors.textSecondary} strokeWidth={1.75} />
                      )}
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      <Text style={styles.bodySmall}>{slot.asset ? 'Đã chọn ảnh · bấm để đổi' : slot.hint}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                <View style={styles.actionRow}>
                  {hasAnySelection && (
                    <TouchableOpacity
                      style={[styles.secondaryBtn, styles.flex1]}
                      disabled={submitting}
                      onPress={resetSlots}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryBtnText}>Chọn lại</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      styles.flex2,
                      (!canSubmit || submitting) && styles.submitBtnDisabled,
                    ]}
                    disabled={!canSubmit || submitting}
                    onPress={handleSubmit}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSubmit || submitting, busy: submitting }}
                  >
                    {submitting ? (
                      <>
                        <ActivityIndicator color={colors.surface} />
                        <Text style={styles.primaryBtnText}>Đang gửi hồ sơ…</Text>
                      </>
                    ) : (
                      <Text style={styles.primaryBtnText}>Nộp hồ sơ xác minh</Text>
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
    <View style={[styles.statusCard, { backgroundColor: tone.bg }]}>
      <Icon size={22} color={tone.fg} strokeWidth={1.75} />
      <View style={styles.flex1}>
        <Text style={[styles.statusTitle, { color: tone.text }]}>{title}</Text>
        <Text style={[styles.statusBody, { color: tone.text }]}>{body}</Text>
      </View>
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  centerBlock: { alignItems: 'center', gap: 12, marginTop: 40 },
  bodySmall: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.error, textAlign: 'center' },
  statusCard: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 16 },
  statusTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  statusBody: { fontSize: 14, lineHeight: 20 },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  formTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 88,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary,
  },
  slotCardFilled: { borderStyle: 'solid', borderColor: colors.tone.success.fg },
  slotThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotImage: { width: '100%', height: '100%' },
  slotLabel: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: colors.surface, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primaryStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
  },
  secondaryBtnText: { color: colors.primaryStrong, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  submitBtnDisabled: { opacity: 0.5 },
});
