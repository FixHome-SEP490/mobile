import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { UploadCloud } from 'lucide-react-native';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { useAppTheme } from '../../constants/theme';
import { SKILL_EVIDENCE_FAILED, SKILL_EVIDENCE_SENT, skillEvidenceProblem, sendSkillEvidence } from './skill-evidence';

/**
 * The certificate step of one service in the skills sheet (web TechnicianProfilePage): shown for a service the
 * technician takes and FixHome has not approved yet. A refused certificate shows its reason on request.
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
  const [reason, setReason] = useState('');

  const upload = async () => {
    if (busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh trong Cài đặt để chọn ảnh chứng chỉ.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    const asset = !picked.canceled ? picked.assets[0] : undefined;
    if (!asset) return;
    const file = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize };
    const problem = skillEvidenceProblem(file);
    if (problem) { setNotice(problem); return; }
    setBusy(true);
    setNotice('');
    try {
      await sendSkillEvidence(serviceId, file);
      setNotice(SKILL_EVIDENCE_SENT);
      setReason('');
      onChanged();
    } catch {
      setNotice(SKILL_EVIDENCE_FAILED);
    } finally { setBusy(false); }
  };

  const showReason = async () => {
    try {
      const verification = await technicianProfileApi.getSkillVerification(serviceId);
      setReason(`Lý do từ chối: ${verification?.rejectionReason?.trim() || 'Không có lý do chi tiết từ FixHome'}`);
    } catch { setReason('Chưa tải được lý do từ chối. Vui lòng thử lại.'); }
  };

  return (
    <View style={styles.wrap}>
      <Pressable testID={`skill-evidence-upload-${serviceId}`} accessibilityRole="button" accessibilityLabel={`Tải lên chứng chỉ ${serviceName}`}
        accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void upload()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator size="small" color={colors.primaryStrong} /> : <UploadCloud size={18} strokeWidth={1.75} color={colors.primaryStrong} />}
        <Text style={styles.buttonText}>{busy ? 'Đang tải lên…' : 'Tải lên chứng chỉ'}</Text>
      </Pressable>
      {status === 'rejected' && !reason && (
        <Pressable testID={`skill-evidence-reason-${serviceId}`} accessibilityRole="button" accessibilityLabel="Xem lý do từ chối" onPress={() => void showReason()}>
          <Text style={styles.link}>Xem lý do từ chối</Text>
        </Pressable>
      )}
      {!!reason && <Text accessibilityRole="alert" style={styles.reason}>{reason}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  wrap: { gap: 6, marginTop: 8 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12 },
  buttonText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  link: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600', paddingVertical: 4 },
  reason: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19 },
  notice: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.8 },
});
