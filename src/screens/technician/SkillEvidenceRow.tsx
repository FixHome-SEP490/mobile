import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { UploadCloud } from 'lucide-react-native';
import { technicianProfileApi, type SkillEvidenceDocument, type SkillVerification } from '../../api/technician-profile.api';
import { useAppTheme } from '../../constants/theme';
import {
  EMPTY_SKILL_EVIDENCE_FORM,
  SKILL_EVIDENCE_FAILED,
  SKILL_EVIDENCE_REVIEW_LABEL,
  SKILL_EVIDENCE_SENT,
  SKILL_EVIDENCE_TYPE_LABEL,
  isoToViDate,
  sendSkillEvidence,
  skillEvidenceDetails,
  skillEvidenceFormProblem,
  skillEvidenceProblem,
  type SkillEvidenceAsset,
  type SkillEvidenceForm,
} from './skill-evidence';
import SkillEvidenceFormFields from './SkillEvidenceFormFields';

const REVIEW_TONE = { pending: 'warning', valid: 'success', invalid: 'danger', need_more: 'warning' } as const;

/**
 * The certificate step of one service in the skills sheet (web TechnicianProfilePage): shown for a service the
 * technician takes and FixHome has not approved yet. After a photo is picked the technician says what the paper is
 * (type, issuer, dates) so the reviewer can weigh it; a refused certificate shows its reason on request.
 */
export default function SkillEvidenceRow({ serviceId, serviceName, status, onChanged }: {
  serviceId: string;
  serviceName: string;
  status: 'pending' | 'verified' | 'rejected';
  onChanged: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [picked, setPicked] = useState<SkillEvidenceAsset | null>(null);
  const [form, setForm] = useState<SkillEvidenceForm>(EMPTY_SKILL_EVIDENCE_FORM);
  const [sent, setSent] = useState<SkillVerification | null>(null);
  const [sentError, setSentError] = useState('');

  const pick = async () => {
    if (busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh trong Cài đặt để chọn ảnh chứng chỉ.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (!asset) return;
    const file = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize };
    const problem = skillEvidenceProblem(file);
    if (problem) { setNotice(problem); return; }
    setNotice('');
    setForm(EMPTY_SKILL_EVIDENCE_FORM);
    setPicked(file);
  };

  const cancel = () => { setPicked(null); setForm(EMPTY_SKILL_EVIDENCE_FORM); setNotice(''); };

  const submit = async () => {
    if (busy || !picked) return;
    const problem = skillEvidenceFormProblem(form);
    if (problem) { setNotice(problem); return; }
    setBusy(true);
    setNotice('');
    try {
      await sendSkillEvidence(serviceId, picked, skillEvidenceDetails(form));
      setPicked(null);
      setForm(EMPTY_SKILL_EVIDENCE_FORM);
      setSent(null);
      setNotice(SKILL_EVIDENCE_SENT);
      onChanged();
    } catch {
      setNotice(SKILL_EVIDENCE_FAILED);
    } finally { setBusy(false); }
  };

  const showSent = async () => {
    setSentError('');
    try {
      setSent(await technicianProfileApi.getSkillVerification(serviceId) ?? { id: '', status, rejectionReason: null, documents: [] });
    } catch { setSentError('Chưa tải được giấy tờ đã gửi. Vui lòng thử lại.'); }
  };

  return (
    <View style={styles.wrap}>
      {!picked && (
        <Pressable testID={`skill-evidence-upload-${serviceId}`} accessibilityRole="button" accessibilityLabel={`Tải lên chứng chỉ ${serviceName}`}
          accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void pick()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <UploadCloud size={18} strokeWidth={1.75} color={colors.primaryStrong} />
          <Text style={styles.buttonText}>Tải lên chứng chỉ</Text>
        </Pressable>
      )}

      {!!picked && (
        <View style={styles.form} testID={`skill-evidence-form-${serviceId}`}>
          <Text style={styles.formTitle}>Thông tin giấy tờ</Text>
          <Text style={styles.hint} numberOfLines={1}>{picked.fileName?.trim() || 'Ảnh đã chọn'}</Text>
          <SkillEvidenceFormFields form={form} onChange={setForm} InputComponent={BottomSheetTextInput as never} labelSuffix={serviceName} testIdPrefix="skill-evidence" />
          <View style={styles.actions}>
            <Pressable testID={`skill-evidence-cancel-${serviceId}`} accessibilityRole="button" accessibilityLabel="Hủy gửi giấy tờ" disabled={busy} onPress={cancel}
              style={({ pressed }) => [styles.button, styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Hủy</Text>
            </Pressable>
            <Pressable testID={`skill-evidence-submit-${serviceId}`} accessibilityRole="button" accessibilityLabel={`Gửi giấy tờ ${serviceName}`}
              accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void submit()}
              style={({ pressed }) => [styles.button, styles.actionButton, styles.primaryButton, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator size="small" color={colors.surface} /> : null}
              <Text style={[styles.buttonText, styles.primaryButtonText]}>{busy ? 'Đang gửi…' : 'Gửi giấy tờ'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!picked && !sent && (
        <Pressable testID={`skill-evidence-reason-${serviceId}`} accessibilityRole="button"
          accessibilityLabel={status === 'rejected' ? 'Xem lý do từ chối' : 'Xem giấy tờ đã gửi'} onPress={() => void showSent()}>
          <Text style={styles.link}>{status === 'rejected' ? 'Xem lý do từ chối' : 'Xem giấy tờ đã gửi'}</Text>
        </Pressable>
      )}
      {!!sent && status === 'rejected' && (
        <Text accessibilityRole="alert" style={styles.reason}>{`Lý do từ chối: ${sent.rejectionReason?.trim() || 'Không có lý do chi tiết từ FixHome'}`}</Text>
      )}
      {!!sent && <SentList documents={sent.documents} styles={styles} colors={colors} />}
      {!!sentError && <Text accessibilityRole="alert" style={styles.reason}>{sentError}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
  );
}

function SentList({ documents, styles, colors }: {
  documents: SkillEvidenceDocument[];
  styles: ReturnType<typeof getStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  if (!documents.length) return <Text style={styles.hint}>Bạn chưa gửi giấy tờ nào.</Text>;
  return (
    <View style={styles.sentList}>
      {documents.map((doc) => {
        const review = doc.reviewStatus ?? 'pending';
        const details = [
          doc.issuer,
          doc.referenceNumber ? `Số ${doc.referenceNumber}` : null,
          doc.issuedAt ? `Cấp ${isoToViDate(doc.issuedAt)}` : null,
          doc.expiresAt ? `Hết hạn ${isoToViDate(doc.expiresAt)}` : null,
          doc.claimedYears != null ? `${doc.claimedYears} năm kinh nghiệm` : null,
        ].filter(Boolean).join(' · ');
        return (
          <View key={doc.id} style={styles.sentItem}>
            <Text style={styles.sentTitle}>{doc.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[doc.evidenceType] : doc.fileName || 'Giấy tờ'}</Text>
            {!!details && <Text style={styles.hint}>{details}</Text>}
            <Text style={[styles.sentStatus, { color: colors.tone[REVIEW_TONE[review]].text }]}>{SKILL_EVIDENCE_REVIEW_LABEL[review]}</Text>
            {!!doc.reviewNote && <Text style={styles.hint}>{doc.reviewNote}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  wrap: { gap: 6, marginTop: 8 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12 },
  buttonText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  primaryButton: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  primaryButtonText: { color: colors.surface },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionButton: { flex: 1 },
  form: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  formTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  sentList: { gap: 8 },
  sentItem: { gap: 2, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sentTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  sentStatus: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600', paddingVertical: 4 },
  reason: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19 },
  notice: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.8 },
});
