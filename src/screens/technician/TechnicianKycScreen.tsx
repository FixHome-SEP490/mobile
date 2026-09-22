// src/screens/technician/TechnicianKycScreen.tsx
import React, { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
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
  const { colors, spacing, fontSize } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<MyVerification | null>(null);
  const [slots, setSlots] = useState<KycSlot[]>(INITIAL_SLOTS);

  useEffect(() => {
    let mounted = true;
    technicianVerificationApi
      .getMyVerification()
      .then((result) => {
        if (mounted) setVerification(result);
      })
      .catch(() => {
        if (mounted) Alert.alert('Lỗi', 'Không thể tải trạng thái xác minh. Vui lòng thử lại.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const showUploadForm = !verification || verification.status === 'REJECTED';
  const styles = getStyles(colors, spacing, fontSize);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Xác minh danh tính (KYC)</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
        ) : (
          <>
            {verification?.status === 'PENDING' && (
              <View style={[styles.statusCard, { borderColor: colors.warning }]}>
                <Ionicons name="time-outline" size={22} color={colors.warning} />
                <View style={styles.statusTextWrap}>
                  <Text style={styles.statusTitle}>Đang chờ duyệt</Text>
                  <Text style={styles.statusBody}>
                    Hồ sơ của bạn đã được nộp và đang chờ quản trị viên xác minh.
                  </Text>
                </View>
              </View>
            )}

            {verification?.status === 'VERIFIED' && (
              <View style={[styles.statusCard, { borderColor: colors.success }]}>
                <Ionicons name="shield-checkmark" size={22} color={colors.success} />
                <View style={styles.statusTextWrap}>
                  <Text style={styles.statusTitle}>Đã xác minh danh tính</Text>
                  <Text style={styles.statusBody}>Bạn có thể nhận việc bình thường.</Text>
                </View>
              </View>
            )}

            {verification?.status === 'REJECTED' && (
              <View style={[styles.statusCard, { borderColor: colors.error }]}>
                <Ionicons name="close-circle-outline" size={22} color={colors.error} />
                <View style={styles.statusTextWrap}>
                  <Text style={styles.statusTitle}>Hồ sơ bị từ chối</Text>
                  <Text style={styles.statusBody}>
                    {verification.rejectionReason || 'Ảnh không hợp lệ. Vui lòng nộp lại.'}
                  </Text>
                </View>
              </View>
            )}

            {showUploadForm && (
              <View style={styles.form}>
                <Text style={styles.formTitle}>Nộp ảnh xác minh</Text>
                <View style={styles.slotRow}>
                  {slots.map((slot) => (
                    <TouchableOpacity
                      key={slot.key}
                      style={[styles.slotBox, slot.asset && styles.slotBoxFilled]}
                      onPress={() => handleSlotPress(slot)}
                    >
                      {slot.asset ? (
                        <Image source={{ uri: slot.asset.uri }} style={styles.slotImage} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={26} color={colors.textSecondary} />
                          <Text style={styles.slotHint}>{slot.hint}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.slotLabelRow}>
                  {slots.map((slot) => (
                    <Text key={slot.key} style={styles.slotLabel}>
                      {slot.label}
                    </Text>
                  ))}
                </View>

                <Text style={styles.helperText}>
                  Ảnh JPEG, PNG hoặc WebP, tối đa 10MB mỗi ảnh.
                </Text>

                <View style={styles.actionRow}>
                  {hasAnySelection && (
                    <TouchableOpacity
                      style={styles.resetBtn}
                      disabled={submitting}
                      onPress={resetSlots}
                    >
                      <Text style={styles.resetBtnText}>Chọn lại</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      (!canSubmit || submitting) && styles.submitBtnDisabled,
                    ]}
                    disabled={!canSubmit || submitting}
                    onPress={handleSubmit}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>Nộp hồ sơ xác minh</Text>
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

const SLOT_SIZE = 96;

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  statusCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statusTextWrap: { flex: 1 },
  statusTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: 2 },
  statusBody: { fontSize: fontSize.sm, color: colors.textSecondary },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  formTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  slotLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs },
  slotBox: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flex: 1,
  },
  slotBoxFilled: { borderStyle: 'solid', borderColor: colors.success },
  slotImage: { width: '100%', height: '100%' },
  slotHint: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  slotLabel: { flex: 1, fontSize: fontSize.xs, fontWeight: '600', color: colors.text, textAlign: 'center' },
  helperText: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  resetBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  resetBtnText: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  submitBtn: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.border },
  submitBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '700' },
});
