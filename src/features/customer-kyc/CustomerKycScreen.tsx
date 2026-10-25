import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, Camera, CheckCircle2, Clock3, ImagePlus, ShieldCheck } from 'lucide-react-native';
import BackButton from '../../components/BackButton';
import { fontSize, lightTheme as colors, spacing } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import type { RootStackParamList } from '../../types';
import {
  customerVerificationApi,
  type CustomerKycDocumentType,
  type CustomerKycGender,
  type CustomerKycMimeType,
  type CustomerKycSubmitPayload,
  type CustomerVerificationState,
} from '../../api/customer-verification.api';
import {
  inferCustomerKycMimeType,
  validateCustomerKycDocuments,
  validateCustomerKycForm,
  vnCalendarDate,
  type CustomerKycFormErrors,
  type CustomerKycFormValues,
  type UploadedCustomerKycDocument,
} from './customer-kyc.validation';

type Side = 'front' | 'back';
type SideAsset = { uri: string; mimeType: CustomerKycMimeType; fileName: string; fileSize: number };

const EMPTY_FORM: CustomerKycFormValues = {
  fullName: '', dateOfBirth: '', gender: '', citizenIdNumber: '', address: '',
};
const EMPTY_PHOTOS: Record<Side, SideAsset | null> = { front: null, back: null };
const DOCUMENT_TYPE: Record<Side, CustomerKycDocumentType> = {
  front: 'citizen_id_front', back: 'citizen_id_back',
};
const SIDE_LABEL: Record<Side, string> = { front: 'mặt trước', back: 'mặt sau' };
const MIME_EXTENSION: Record<CustomerKycMimeType, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function statusCopy(state: CustomerVerificationState) {
  switch (state.status) {
    case 'pending': return { title: 'Đang chờ duyệt', detail: 'Hồ sơ đã được gửi. Bạn có thể tiếp tục sử dụng các dịch vụ khác trong lúc chờ kết quả.', icon: Clock3, tone: 'warning' as const };
    case 'verified': return { title: 'Đã xác minh', detail: 'Danh tính của bạn đã được xác minh.', icon: ShieldCheck, tone: 'success' as const };
    case 'rejected': return { title: 'Cần gửi lại hồ sơ', detail: state.rejectionReason || 'Ảnh hoặc thông tin chưa đáp ứng yêu cầu. Hãy kiểm tra và gửi lại.', icon: AlertTriangle, tone: 'danger' as const };
    default: return { title: 'Xác minh CCCD', detail: 'Gửi thông tin khớp với CCCD và ảnh rõ cả hai mặt.', icon: ShieldCheck, tone: 'info' as const };
  }
}

export default function CustomerKycScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const userId = useAuthStore(state => state.user?.role === 'customer' ? state.user.id : null);
  const sessionGeneration = useAuthStore(state => state.sessionGeneration);
  const ownerKey = `${userId ?? 'none'}/${sessionGeneration}`;
  const ownerKeyRef = useRef(ownerKey);
  useEffect(() => { ownerKeyRef.current = ownerKey; }, [ownerKey]);
  const focusedRef = useRef(false);
  const operationRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const submitLockRef = useRef(false);
  const submittingRequestRef = useRef(false);
  const fullNameRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);
  const citizenIdRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);

  const [verification, setVerification] = useState<CustomerVerificationState | null>(null);
  const [form, setForm] = useState<CustomerKycFormValues>(EMPTY_FORM);
  const [photos, setPhotos] = useState<Record<Side, SideAsset | null>>(EMPTY_PHOTOS);
  const [uploaded, setUploaded] = useState<Partial<Record<CustomerKycDocumentType, UploadedCustomerKycDocument>>>({});
  const [fieldErrors, setFieldErrors] = useState<CustomerKycFormErrors & { documents?: string }>({});
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unknownAck, setUnknownAck] = useState(false);
  const [checkingAck, setCheckingAck] = useState(false);
  const [message, setMessage] = useState('');

  const resetPrivateDraft = useCallback(() => {
    setForm(EMPTY_FORM);
    setPhotos(EMPTY_PHOTOS);
    setUploaded({});
    setFieldErrors({});
  }, []);

  const cancelUploadsAndClear = useCallback((background = false) => {
    operationRef.current += 1;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    if (background && submittingRequestRef.current) setUnknownAck(true);
    resetPrivateDraft();
    setVerification(current => current ? {
      ...current,
      rejectionReason: null,
      profile: { fullName: '', dateOfBirth: null, gender: null, citizenIdNumber: null, address: null },
    } : current);
    setSubmitting(false);
    setMessage(background ? 'Thông tin và ảnh nháp đã được xóa khi ứng dụng chạy nền.' : '');
  }, [resetPrivateDraft]);

  const applyServerState = useCallback((state: CustomerVerificationState) => {
    setVerification(state);
    if (state.status === 'none' || state.status === 'rejected') {
      setForm({
        fullName: state.profile.fullName,
        dateOfBirth: state.profile.dateOfBirth ?? '',
        gender: state.profile.gender ?? '',
        citizenIdNumber: state.profile.citizenIdNumber ?? '',
        address: state.profile.address ?? '',
      });
    }
  }, []);

  const loadVerification = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setLoadingError(true);
      return;
    }
    setLoading(true);
    setLoadingError(false);
    const operation = operationRef.current;
    try {
      const result = await customerVerificationApi.getMine();
      if (ownerKeyRef.current !== ownerKey || operationRef.current !== operation) return;
      applyServerState(result);
      setLoadingError(false);
    } catch {
      if (ownerKeyRef.current === ownerKey && operationRef.current === operation) setLoadingError(true);
    } finally {
      if (ownerKeyRef.current === ownerKey && operationRef.current === operation) setLoading(false);
    }
  }, [applyServerState, ownerKey, userId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void loadVerification();
    return () => {
      focusedRef.current = false;
      cancelUploadsAndClear();
    };
  }, [cancelUploadsAndClear, loadVerification]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background') cancelUploadsAndClear(true);
      if (next === 'active' && focusedRef.current && unknownAck) {
        void loadVerification().then(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [cancelUploadsAndClear, loadVerification, unknownAck]);

  useEffect(() => {
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const setField = <K extends keyof CustomerKycFormValues>(key: K, value: CustomerKycFormValues[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: undefined }));
    setMessage('');
  };

  const acceptAsset = (side: Side, asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = inferCustomerKycMimeType(asset.mimeType, asset.uri);
    const fileSize = asset.fileSize;
    if (!mimeType || !Number.isSafeInteger(fileSize) || !fileSize || fileSize < 1 || fileSize > MAX_FILE_SIZE) {
      setMessage('Chọn ảnh JPG, PNG hoặc WEBP có dung lượng từ 1 đến 10 MB.');
      return;
    }
    const fileName = `cccd-mat-${side === 'front' ? 'truoc' : 'sau'}.${MIME_EXTENSION[mimeType]}`;
    setPhotos(current => ({ ...current, [side]: { uri: asset.uri, mimeType, fileName, fileSize } }));
    setUploaded(current => {
      const next = { ...current };
      delete next[DOCUMENT_TYPE[side]];
      return next;
    });
    setFieldErrors(current => ({ ...current, documents: undefined }));
    setMessage('');
  };

  const chooseImage = async (side: Side, source: 'library' | 'camera') => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage(source === 'camera' ? 'Cần quyền camera để chụp ảnh CCCD.' : 'Cần quyền truy cập ảnh để chọn ảnh CCCD.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9, cameraType: ImagePicker.CameraType.back })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
      if (!result.canceled && result.assets[0]) acceptAsset(side, result.assets[0]);
    } catch {
      setMessage('Không thể mở ảnh. Hãy thử lại.');
    }
  };

  const checkUnknownAcknowledgement = async () => {
    if (!userId || checkingAck) return;
    const operation = operationRef.current;
    setCheckingAck(true);
    setMessage('Đang kiểm tra trạng thái hồ sơ trên máy chủ.');
    try {
      const result = await customerVerificationApi.getMine();
      if (operationRef.current !== operation || ownerKeyRef.current !== ownerKey) return;
      applyServerState(result);
      if (result.status === 'pending' || result.status === 'verified') {
        setUnknownAck(false);
        setMessage(result.status === 'pending' ? 'Hồ sơ đang chờ duyệt.' : 'Danh tính đã được xác minh.');
        resetPrivateDraft();
      } else {
        setUnknownAck(true);
        setMessage('Chưa xác định được kết quả gửi. Không gửi lại tự động; hãy kiểm tra lại trạng thái sau.');
      }
    } catch {
      if (operationRef.current !== operation || ownerKeyRef.current !== ownerKey) return;
      setUnknownAck(true);
      setMessage('Chưa tải được trạng thái. Không gửi lại hồ sơ; hãy kiểm tra lại sau.');
    } finally {
      if (operationRef.current === operation && ownerKeyRef.current === ownerKey) setCheckingAck(false);
    }
  };

  const submit = async () => {
    if (submitLockRef.current || submitting || unknownAck || !userId) return;
    const errors = validateCustomerKycForm(form, vnCalendarDate());
    const nextErrors: CustomerKycFormErrors & { documents?: string } = { ...errors };
    if (!photos.front) nextErrors.documents = 'Chọn ảnh rõ mặt trước và mặt sau CCCD.';
    if (!photos.back) nextErrors.documents = 'Chọn ảnh rõ mặt trước và mặt sau CCCD.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = Object.values(nextErrors)[0];
      setMessage(first ?? 'Kiểm tra lại thông tin và hai ảnh CCCD.');
      return;
    }

    submitLockRef.current = true;
    const operation = ++operationRef.current;
    const signalController = new AbortController();
    uploadAbortRef.current = signalController;
    setSubmitting(true);
    setMessage('Đang tải ảnh CCCD riêng tư lên kho bảo mật.');
    let postStarted = false;
    const isCurrent = () => operationRef.current === operation && ownerKeyRef.current === ownerKey;
    try {
      const nextUploaded = { ...uploaded };
      for (const side of ['front', 'back'] as const) {
        const documentType = DOCUMENT_TYPE[side];
        if (nextUploaded[documentType]) continue;
        const asset = photos[side];
        if (!asset) throw new Error('Chọn đủ hai mặt CCCD trước khi gửi.');
        const result = await customerVerificationApi.uploadDocument({
          userId, documentType, mimeType: asset.mimeType,
          file: { uri: asset.uri, fileName: asset.fileName, fileSize: asset.fileSize },
          reservedPaths: Object.values(nextUploaded).map(document => document.storageObjectPath),
          signal: signalController.signal,
        });
        if (!isCurrent()) return;
        nextUploaded[documentType] = result;
        setUploaded({ ...nextUploaded });
      }
      const documents = [nextUploaded.citizen_id_front, nextUploaded.citizen_id_back]
        .filter((document): document is UploadedCustomerKycDocument => !!document);
      const documentError = validateCustomerKycDocuments(documents, userId);
      if (documentError) throw new Error(documentError);
      const payload: CustomerKycSubmitPayload = {
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender as CustomerKycGender,
        citizenIdNumber: form.citizenIdNumber,
        address: form.address.trim(),
        documents,
      };
      if (!isCurrent()) return;
      postStarted = true;
      submittingRequestRef.current = true;
      setMessage('Đang gửi hồ sơ xác minh.');
      const result = await customerVerificationApi.submit(payload, userId);
      if (!isCurrent()) return;
      setVerification(result);
      setUnknownAck(false);
      resetPrivateDraft();
      setMessage('Đã gửi hồ sơ xác minh.');
    } catch {
      if (!isCurrent()) return;
      if (!postStarted) {
        setMessage(signalController.signal.aborted ? 'Tác vụ đã dừng; ảnh và thông tin cần được chọn lại.' : 'Chưa tải đủ ảnh CCCD. Kiểm tra ảnh lỗi rồi thử lại.');
        return;
      }
      setUnknownAck(true);
      setMessage('Chưa xác định được kết quả gửi hồ sơ. Không gửi lại tự động.');
      try {
        const result = await customerVerificationApi.getMine();
        if (!isCurrent()) return;
        applyServerState(result);
        if (result.status === 'pending' || result.status === 'verified') {
          setUnknownAck(false);
          resetPrivateDraft();
          setMessage(result.status === 'pending' ? 'Hồ sơ đang chờ duyệt.' : 'Danh tính đã được xác minh.');
        }
      } catch {
        // Keep the submit locked until the server status can be checked.
      }
    } finally {
      submittingRequestRef.current = false;
      uploadAbortRef.current = null;
      submitLockRef.current = false;
      if (ownerKeyRef.current === ownerKey) setSubmitting(false);
    }
  };

  const retryLoad = () => { void loadVerification(); };
  const resolvedStatus = verification ? statusCopy(verification) : null;
  const StatusIcon = resolvedStatus?.icon ?? ShieldCheck;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <BackButton />
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Tài khoản khách hàng</Text>
            <Text style={styles.title} accessibilityRole="header">Xác minh danh tính</Text>
          </View>
          <View style={styles.headerBalance} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={styles.centerState} testID="customer-kyc-loading" accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.primaryStrong} />
              <Text style={styles.body}>Đang kiểm tra trạng thái hồ sơ…</Text>
            </View>
          ) : loadingError || !verification ? (
            <View style={styles.statusCard}>
              <AlertTriangle color={colors.error} size={24} />
              <Text style={styles.statusTitle}>Chưa tải được trạng thái xác minh</Text>
              <Text style={styles.body}>Hãy kiểm tra lại trước khi gửi hồ sơ.</Text>
              <Pressable style={styles.secondaryButton} onPress={retryLoad} accessibilityRole="button" accessibilityLabel="Tải lại trạng thái xác minh">
                <Text style={styles.secondaryButtonText}>Thử lại</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                testID={`customer-kyc-status-${verification.status}`}
                style={[styles.statusCard, resolvedStatus?.tone === 'success' && styles.successCard, resolvedStatus?.tone === 'warning' && styles.warningCard, resolvedStatus?.tone === 'danger' && styles.dangerCard]}
                accessibilityLabel={`Trạng thái xác minh: ${resolvedStatus?.title}`}
              >
                <StatusIcon color={resolvedStatus?.tone === 'success' ? colors.success : resolvedStatus?.tone === 'danger' ? colors.error : colors.primaryStrong} size={25} />
                <View style={styles.statusText}>
                  <Text style={styles.statusTitle}>{resolvedStatus?.title}</Text>
                  <Text style={styles.body}>{resolvedStatus?.detail}</Text>
                </View>
              </View>

              {verification.status === 'verified' ? (
                <Pressable
                  testID="customer-kyc-continue-withdrawal"
                  style={styles.verifiedContinue}
                  onPress={() => navigation.navigate('CustomerWithdraw')}
                  accessibilityRole="button"
                  accessibilityLabel="Tiếp tục rút tiền"
                >
                  <Text style={styles.verifiedContinueText}>Tiếp tục rút tiền</Text>
                </Pressable>
              ) : null}

              {unknownAck ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{message || 'Chưa xác định được kết quả gửi. Không gửi lại tự động.'}</Text>
                  <Pressable style={styles.secondaryButton} onPress={checkUnknownAcknowledgement} disabled={checkingAck} accessibilityRole="button" accessibilityState={{ busy: checkingAck, disabled: checkingAck }}>
                    {checkingAck ? <ActivityIndicator color={colors.primaryStrong} /> : <Text style={styles.secondaryButtonText}>Kiểm tra trạng thái</Text>}
                  </Pressable>
                </View>
              ) : null}

              {verification.status === 'none' || verification.status === 'rejected' ? (
                <>
                  <Text style={styles.intro}>Nhập thông tin đúng như trên CCCD. Ảnh hai mặt được tải trực tiếp lên kho riêng tư.</Text>
                  <View style={styles.formCard}>
                    {renderField('Họ và tên', form.fullName, value => setField('fullName', value), {
                      testID: 'customer-kyc-fullName', error: fieldErrors.fullName, inputRef: fullNameRef,
                      autoComplete: 'name', textContentType: 'name', returnKeyType: 'next',
                      onSubmitEditing: () => dobRef.current?.focus(),
                    })}
                    {renderField('Ngày sinh', form.dateOfBirth, value => setField('dateOfBirth', value), {
                      testID: 'customer-kyc-dateOfBirth', error: fieldErrors.dateOfBirth, inputRef: dobRef,
                      placeholder: 'YYYY-MM-DD', keyboardType: 'numbers-and-punctuation', returnKeyType: 'next',
                      onSubmitEditing: () => citizenIdRef.current?.focus(),
                      helper: 'Từ năm 1900 và đủ 18 tuổi theo ngày Việt Nam.',
                    })}
                    <View style={styles.field}>
                      <Text style={styles.label}>Giới tính</Text>
                      <View style={styles.genderRow}>
                        {([['MALE', 'Nam'], ['FEMALE', 'Nữ'], ['OTHER', 'Khác']] as const).map(([gender, label]) => (
                          <Pressable
                            key={gender}
                            testID={`customer-kyc-gender-${gender}`}
                            style={[styles.genderOption, form.gender === gender && styles.genderOptionSelected]}
                            onPress={() => setField('gender', gender)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: form.gender === gender }}
                            accessibilityLabel={label}
                          >
                            <Text style={[styles.genderText, form.gender === gender && styles.genderTextSelected]}>{label}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {fieldErrors.gender ? <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.gender}</Text> : null}
                    </View>
                    {renderField('Số CCCD', form.citizenIdNumber, value => setField('citizenIdNumber', value), {
                      testID: 'customer-kyc-citizenIdNumber', error: fieldErrors.citizenIdNumber, inputRef: citizenIdRef,
                      keyboardType: 'number-pad', maxLength: 12, returnKeyType: 'next',
                      onSubmitEditing: () => addressRef.current?.focus(),
                    })}
                    {renderField('Địa chỉ', form.address, value => setField('address', value), {
                      testID: 'customer-kyc-address', error: fieldErrors.address, inputRef: addressRef,
                      autoComplete: 'street-address', textContentType: 'fullStreetAddress', multiline: true,
                      returnKeyType: 'done', helper: 'Nhập từ 5 đến 500 ký tự.',
                    })}
                  </View>

                  <Text style={styles.sectionTitle}>Ảnh CCCD</Text>
                  <Text style={styles.body}>Chọn ảnh JPG, PNG hoặc WEBP, dung lượng 1–10 MB. Kiểm tra đủ sáng và rõ thông tin.</Text>
                  <View style={styles.photoList}>
                    {(['front', 'back'] as const).map(side => (
                      <View key={side} testID={`customer-kyc-photo-card-${side}`} style={styles.photoCard}>
                        <View style={styles.photoHeading}>
                          <View style={styles.photoIcon}><ImagePlus size={19} color={colors.primaryStrong} /></View>
                          <View style={styles.photoTitleBox}>
                            <Text style={styles.photoTitle}>CCCD {SIDE_LABEL[side]}</Text>
                            <Text style={styles.bodySmall} numberOfLines={1} ellipsizeMode="middle">{photos[side] ? photos[side]?.fileName : 'Chưa chọn ảnh'}</Text>
                          </View>
                          {uploaded[DOCUMENT_TYPE[side]] ? <CheckCircle2 size={20} color={colors.success} /> : null}
                        </View>
                        {photos[side] ? (
                          <Image source={{ uri: photos[side]?.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel={`Ảnh CCCD ${SIDE_LABEL[side]}`} />
                        ) : (
                          <View testID={`customer-kyc-photo-placeholder-${side}`} style={styles.emptyPreview} accessible accessibilityLabel={`Chưa chọn ảnh CCCD ${SIDE_LABEL[side]}`}>
                            <ImagePlus size={19} color={colors.primaryStrong} />
                            <Text style={styles.emptyPreviewText}>Chưa chọn ảnh</Text>
                          </View>
                        )}
                        <View style={styles.photoActions}>
                          <Pressable testID={`customer-kyc-pick-${side}`} style={styles.photoButton} onPress={() => void chooseImage(side, 'library')} accessibilityRole="button" accessibilityLabel={`Chọn ảnh CCCD ${SIDE_LABEL[side]} từ thư viện`}>
                            <ImagePlus size={17} color={colors.primaryStrong} />
                            <Text style={styles.photoButtonText}>Thư viện</Text>
                          </Pressable>
                          <Pressable testID={`customer-kyc-camera-${side}`} style={styles.photoButton} onPress={() => void chooseImage(side, 'camera')} accessibilityRole="button" accessibilityLabel={`Chụp ảnh CCCD ${SIDE_LABEL[side]}`}>
                            <Camera size={17} color={colors.primaryStrong} />
                            <Text style={styles.photoButtonText}>Chụp ảnh</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                  {fieldErrors.documents ? <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.documents}</Text> : null}
                </>
              ) : null}

              {message && !unknownAck ? <Text style={styles.noticeText} accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Text> : null}

              {verification.status === 'none' || verification.status === 'rejected' ? (
                <View style={styles.submitArea}>
                  <Pressable
                    testID="customer-kyc-submit"
                    style={[styles.submitButton, (submitting || unknownAck) && styles.disabledButton]}
                    onPress={() => void submit()}
                    disabled={submitting || unknownAck}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: submitting || unknownAck, busy: submitting }}
                    accessibilityLabel="Gửi hồ sơ xác minh CCCD"
                  >
                    {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>Gửi hồ sơ</Text>}
                  </Pressable>
                  <Text style={styles.privacyNote}>Chỉ Backend xác minh được quyền xử lý hồ sơ. Không lưu ảnh CCCD trong lịch sử ứng dụng.</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type RenderFieldOptions = {
  testID: string;
  error?: string;
  helper?: string;
  inputRef?: React.RefObject<TextInput | null>;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'numbers-and-punctuation';
  maxLength?: number;
  autoComplete?: 'name' | 'street-address';
  textContentType?: 'name' | 'fullStreetAddress';
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  multiline?: boolean;
};

function renderField(
  label: string,
  value: string,
  onChangeText: (value: string) => void,
  options: RenderFieldOptions,
) {
  const { testID, error, helper, inputRef } = options;
  return (
    <View style={styles.field} key={testID}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={options.placeholder ?? label}
        placeholderTextColor={colors.muted}
        style={[styles.input, options.multiline && styles.multilineInput, error && styles.inputError]}
        accessibilityLabel={label}
        accessibilityHint={helper}
        autoCapitalize={label === 'Họ và tên' ? 'words' : 'none'}
        returnKeyType={options.returnKeyType}
        onSubmitEditing={options.onSubmitEditing}
        submitBehavior={options.multiline ? 'newline' : 'submit'}
        keyboardType={options.keyboardType ?? 'default'}
        maxLength={options.maxLength}
        autoComplete={options.autoComplete}
        textContentType={options.textContentType}
        multiline={options.multiline}
      />
      {error ? <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerText: { flex: 1, alignItems: 'center' },
  headerBalance: { width: 44 },
  eyebrow: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  centerState: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.primarySoft, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  successCard: { backgroundColor: colors.tone.success.bg, borderColor: colors.tone.success.bg },
  warningCard: { backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.bg },
  dangerCard: { backgroundColor: colors.tone.danger.bg, borderColor: colors.tone.danger.bg },
  statusText: { flex: 1, gap: spacing.xs },
  verifiedContinue: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.primaryStrong, borderRadius: 12, backgroundColor: colors.surface },
  verifiedContinueText: { color: colors.primaryStrong, fontSize: fontSize.sm, fontWeight: '700' },
  statusTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 21 },
  bodySmall: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  intro: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 21 },
  formCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  field: { gap: spacing.xs },
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  input: { minHeight: 50, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  multilineInput: { minHeight: 80, paddingTop: spacing.sm, textAlignVertical: 'top' },
  inputError: { borderColor: colors.error },
  helper: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  fieldError: { color: colors.error, fontSize: fontSize.xs, lineHeight: 18 },
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  genderOption: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  genderOptionSelected: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  genderText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  genderTextSelected: { color: colors.primaryStrong },
  sectionTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.xs },
  photoList: { gap: spacing.md },
  photoCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing.sm, gap: spacing.sm },
  photoHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  photoTitleBox: { flex: 1, gap: 2 },
  photoTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  preview: { width: '100%', height: 170, borderRadius: 10, backgroundColor: colors.background },
  emptyPreview: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.background },
  emptyPreviewText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  photoButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  photoButtonText: { color: colors.primaryStrong, fontSize: fontSize.xs, fontWeight: '600' },
  notice: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.tone.warning.bg, borderColor: colors.tone.warning.bg, borderWidth: 1 },
  noticeText: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 19 },
  secondaryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.primaryStrong },
  secondaryButtonText: { color: colors.primaryStrong, fontWeight: '700', fontSize: fontSize.sm },
  submitArea: { gap: spacing.sm, marginTop: spacing.sm },
  submitButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primaryStrong },
  disabledButton: { opacity: 0.6 },
  submitText: { color: colors.surface, fontSize: fontSize.md, fontWeight: '700' },
  privacyNote: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17, textAlign: 'center' },
});
