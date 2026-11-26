import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Check, UploadCloud } from 'lucide-react-native';
import { technicianProfileApi, type SentSkillEvidence } from '../../api/technician-profile.api';
import { useAppTheme } from '../../constants/theme';
import {
  EMPTY_SKILL_EVIDENCE_FORM,
  SKILL_EVIDENCE_TYPE_LABEL,
  skillEvidenceFormProblem,
  skillEvidenceProblem,
  type SkillEvidenceAsset,
  type SkillEvidenceForm,
  type StagedSkillPaper,
} from './skill-evidence';
import SkillEvidenceFormFields from './SkillEvidenceFormFields';

const titleOf = (paper: SentSkillEvidence) => (paper.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[paper.evidenceType] : paper.fileName);
const normalized = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/**
 * Giấy tờ cho một kỹ năng vừa bật mà chưa đăng ký. Backend mở phiếu duyệt ngay khi lưu kỹ năng, nên giấy tờ được giữ tạm ở đây
 * (chọn từ giấy tờ đã up hoặc tải ảnh mới) và gửi cùng lúc bấm Lưu thay đổi, để phiếu chờ duyệt đã có giấy tờ.
 */
export default function StagedSkillPapers({ serviceId, serviceName, items, onChange }: {
  serviceId: string;
  serviceName: string;
  items: StagedSkillPaper[];
  onChange: (items: StagedSkillPaper[]) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [library, setLibrary] = useState<SentSkillEvidence[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [picked, setPicked] = useState<SkillEvidenceAsset | null>(null);
  const [form, setForm] = useState<SkillEvidenceForm>(EMPTY_SKILL_EVIDENCE_FORM);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const stagedIds = items.flatMap((i) => (i.kind === 'reuse' ? [i.paper.documentId] : []));

  const pick = async () => {
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

  const openAdd = async () => {
    if (loading) return;
    setNotice('');
    setLoading(true);
    let papers: SentSkillEvidence[] = [];
    try { papers = await technicianProfileApi.getMySkillEvidence(); } catch { /* không có danh sách: tải ảnh mới */ }
    setLoading(false);
    setLibrary(papers);
    if (papers.some((p) => !stagedIds.includes(p.documentId))) { setChosen([]); setChoosing(true); } else void pick();
  };

  const addChosen = () => {
    onChange([...items, ...library.filter((p) => chosen.includes(p.documentId)).map((paper) => ({ kind: 'reuse', paper }) as const)]);
    setChoosing(false);
    setChosen([]);
  };

  const addNew = () => {
    if (!picked) return;
    const problem = skillEvidenceFormProblem(form);
    if (problem) { setNotice(problem); return; }
    const number = normalized(form.referenceNumber);
    const same = (type: string | null, ref: string | null | undefined) => !!number && type === form.evidenceType && normalized(ref) === number;
    if (items.some((i) => (i.kind === 'reuse' ? same(i.paper.evidenceType, i.paper.referenceNumber) : same(i.form.evidenceType, i.form.referenceNumber)))) {
      setNotice('Bạn đã thêm giấy tờ này (cùng loại, cùng số hiệu). Không cần tải lại.');
      return;
    }
    onChange([...items, { kind: 'new', asset: picked, form }]);
    setPicked(null);
    setForm(EMPTY_SKILL_EVIDENCE_FORM);
    setNotice('');
  };

  return (
    <View style={styles.wrap} testID={`skill-staged-${serviceId}`}>
      <Text style={styles.hint}>Thêm giấy tờ để FixHome duyệt kỹ năng này. Giấy tờ được gửi cùng lúc bạn bấm Lưu thay đổi.</Text>

      {items.map((item, index) => (
        <View key={item.kind === 'reuse' ? item.paper.documentId : `new-${index}`} style={styles.item} testID={`skill-staged-item-${serviceId}-${index}`}>
          <View style={styles.body}>
            <Text style={styles.title}>{item.kind === 'reuse' ? titleOf(item.paper) : (item.form.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[item.form.evidenceType] : 'Giấy tờ')}</Text>
            <Text style={styles.hint}>{item.kind === 'reuse' ? 'Dùng lại giấy tờ đã up' : 'Ảnh mới'} · gửi khi lưu</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Bỏ giấy tờ này" onPress={() => onChange(items.filter((_, i) => i !== index))}>
            <Text style={styles.link}>Bỏ</Text>
          </Pressable>
        </View>
      ))}

      {choosing && !picked && (
        <View style={styles.form} testID={`skill-staged-choose-${serviceId}`}>
          <Text style={styles.formTitle}>Chọn giấy tờ đã up</Text>
          {library.map((paper) => {
            const staged = stagedIds.includes(paper.documentId);
            const on = chosen.includes(paper.documentId);
            return (
              <Pressable key={paper.documentId} testID={`skill-staged-choice-${paper.documentId}`} accessibilityRole="checkbox" accessibilityLabel={titleOf(paper)}
                accessibilityState={{ checked: on, disabled: staged }} disabled={staged}
                onPress={() => setChosen((cur) => (on ? cur.filter((id) => id !== paper.documentId) : [...cur, paper.documentId]))}
                style={[styles.choice, staged && styles.dim]}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} strokeWidth={2.5} color={colors.surface} /> : null}</View>
                <Text style={styles.title}>{titleOf(paper)}</Text>
                {staged ? <Text style={styles.hint}>Đã thêm</Text> : null}
              </Pressable>
            );
          })}
          <View style={styles.actions}>
            <Pressable testID={`skill-staged-choose-new-${serviceId}`} accessibilityRole="button" accessibilityLabel="Tải ảnh mới" onPress={() => { setChoosing(false); void pick(); }} style={[styles.button, styles.flex]}>
              <Text style={styles.buttonText}>Tải ảnh mới</Text>
            </Pressable>
            <Pressable testID={`skill-staged-choose-add-${serviceId}`} accessibilityRole="button" accessibilityLabel="Thêm giấy tờ đã chọn" accessibilityState={{ disabled: chosen.length === 0 }}
              disabled={chosen.length === 0} onPress={addChosen} style={[styles.button, styles.flex, styles.primary, chosen.length === 0 && styles.dim]}>
              <Text style={[styles.buttonText, styles.primaryText]}>{chosen.length ? `Thêm ${chosen.length} giấy tờ` : 'Thêm giấy tờ'}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn giấy tờ" onPress={() => setChoosing(false)}><Text style={styles.link}>Hủy</Text></Pressable>
        </View>
      )}

      {!!picked && (
        <View style={styles.form} testID={`skill-staged-form-${serviceId}`}>
          <Text style={styles.formTitle}>Thông tin giấy tờ</Text>
          <Text style={styles.hint} numberOfLines={1}>{picked.fileName?.trim() || 'Ảnh đã chọn'}</Text>
          <SkillEvidenceFormFields form={form} onChange={setForm} labelSuffix={serviceName} testIdPrefix="skill-staged" />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Hủy thêm giấy tờ" onPress={() => { setPicked(null); setNotice(''); }} style={[styles.button, styles.flex]}>
              <Text style={styles.buttonText}>Hủy</Text>
            </Pressable>
            <Pressable testID={`skill-staged-add-new-${serviceId}`} accessibilityRole="button" accessibilityLabel={`Thêm giấy tờ ${serviceName}`} onPress={addNew} style={[styles.button, styles.flex, styles.primary]}>
              <Text style={[styles.buttonText, styles.primaryText]}>Thêm vào kỹ năng</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!picked && !choosing && (
        <Pressable testID={`skill-staged-add-${serviceId}`} accessibilityRole="button" accessibilityLabel={`Thêm giấy tờ ${serviceName}`} accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading} onPress={() => void openAdd()} style={styles.button}>
          {loading ? <ActivityIndicator size="small" color={colors.primaryStrong} /> : <UploadCloud size={18} strokeWidth={1.75} color={colors.primaryStrong} />}
          <Text style={styles.buttonText}>Thêm giấy tờ</Text>
        </Pressable>
      )}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  wrap: { gap: 6, marginTop: 8 },
  flex: { flex: 1 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12 },
  buttonText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  primary: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  primaryText: { color: colors.surface },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  form: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  formTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600', paddingVertical: 4 },
  notice: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  dim: { opacity: 0.5 },
});
