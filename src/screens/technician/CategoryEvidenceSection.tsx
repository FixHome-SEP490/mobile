import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Check, FileText, Pencil, Trash2, UploadCloud } from 'lucide-react-native';
import { technicianProfileApi, type SentSkillEvidence } from '../../api/technician-profile.api';
import { iconStroke, useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import PillText from '../../components/PillText';
import { EvidencePhotoStage, EvidencePhotoThumb } from '../../components/technician/EvidencePhotoPreview';
import OnboardingSection from './OnboardingSection';
import SkillEvidenceFormFields from './SkillEvidenceFormFields';
import {
  EMPTY_SKILL_EVIDENCE_FORM,
  MAX_STAGED_SKILL_EVIDENCE,
  SKILL_EVIDENCE_TYPE_LABEL,
  skillEvidenceCategoriesProblem,
  skillEvidenceDetails,
  skillEvidenceFormFromSent,
  skillEvidenceFormProblem,
  skillEvidenceProblem,
  type EvidenceCategory,
  type SkillEvidenceAsset,
  type SkillEvidenceForm,
  type StagedSkillEvidence,
} from './skill-evidence';

const VISIBLE_GROUPS = 4;
/** Groups named on a sent paper before the rest fold into "+n nhóm". */
const MAX_CHIPS = 3;

/**
 * End of step 3 of the technician registration: papers that prove the skills just chosen (PO 24/11/2026). Each paper
 * covers the categories the technician ticks (none to start with, at least one is needed), so a paper for air conditioners does not
 * vouch for electrical work. The papers wait here and are sent after "Lưu và tiếp tục" saves the skills.
 */
export default function CategoryEvidenceSection({ staged, categories, onChange, disabled, refreshKey = 0 }: {
  staged: StagedSkillEvidence[];
  /** The categories of the services chosen above; the only ones a paper may cover. */
  categories: EvidenceCategory[];
  onChange: (next: StagedSkillEvidence[]) => void;
  disabled?: boolean;
  /** Change it to read the papers already sent again (after a save). */
  refreshKey?: number;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [picked, setPicked] = useState<SkillEvidenceAsset | null>(null);
  const [form, setForm] = useState<SkillEvidenceForm>(EMPTY_SKILL_EVIDENCE_FORM);
  const [sent, setSent] = useState<SentSkillEvidence[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    let live = true;
    technicianProfileApi.getMySkillEvidence().then((list) => { if (live) setSent(list); }, () => undefined);
    return () => { live = false; };
  }, [refreshKey, reloadTick]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [notice, setNotice] = useState('');
  const toggleCategory = (id: string) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const nameOf = (ids: string[]) => categories.filter((c) => ids.includes(c.id)).map((c) => c.name).join(', ');

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh trong Cài đặt để chọn ảnh giấy tờ.');
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
    // Nothing ticked to start with when there is a choice, so the technician says which groups the paper proves.
    setChosen(categories.length > 1 ? [] : categories.map((c) => c.id));
    setPicked(file);
  };

  const close = () => { setPicked(null); setForm(EMPTY_SKILL_EVIDENCE_FORM); setNotice(''); };

  // A paper already sent is edited in the same form, with its photo read back; the photo itself cannot be changed.
  const [editing, setEditing] = useState<SentSkillEvidence | null>(null);
  const [editUri, setEditUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeEdit = () => { setEditing(null); setEditUri(null); setForm(EMPTY_SKILL_EVIDENCE_FORM); setNotice(''); };
  const startEdit = (item: SentSkillEvidence) => {
    setPicked(null);
    setNotice('');
    setForm(skillEvidenceFormFromSent(item));
    setChosen(categories.length > 1 ? item.categories.map((c) => c.id) : categories.map((c) => c.id));
    setEditUri(null);
    setEditing(item);
    if (item.mimeType.startsWith('image/')) {
      technicianProfileApi.getSkillEvidenceAccess(item.serviceId, item.documentId).then((url) => setEditUri(url || null), () => undefined);
    }
  };
  const saveEdit = async () => {
    if (!editing || saving) return;
    const categoryIds = categories.filter((c) => chosen.includes(c.id)).map((c) => c.id);
    const problem = skillEvidenceFormProblem(form) ?? skillEvidenceCategoriesProblem(categoryIds);
    const details = skillEvidenceDetails(form);
    if (problem || !details) { setNotice(problem ?? ''); return; }
    setSaving(true);
    try {
      setSent(await technicianProfileApi.updateSkillEvidence(editing.documentId, { ...details, categoryIds }));
      closeEdit();
    } catch (err) {
      setNotice(extractApiErrorMessage(err, 'Không lưu được thay đổi. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };
  const removeSent = (item: SentSkillEvidence) => Alert.alert(
    'Xóa giấy tờ này?',
    'Giấy tờ sẽ được gỡ khỏi tất cả nhóm đã gắn.',
    [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          technicianProfileApi.deleteSkillEvidence(item.documentId).then(
            () => { setNotice(''); setReloadTick((n) => n + 1); },
            (err) => Alert.alert('Không xóa được giấy tờ', extractApiErrorMessage(err, 'Vui lòng thử lại.')),
          );
        },
      },
    ],
  );

  const add = () => {
    if (!picked) return;
    const categoryIds = categories.filter((c) => chosen.includes(c.id)).map((c) => c.id);
    const problem = skillEvidenceFormProblem(form) ?? skillEvidenceCategoriesProblem(categoryIds);
    const details = skillEvidenceDetails(form);
    if (problem || !details) { setNotice(problem ?? ''); return; }
    onChange([...staged, { key: `${Date.now()}-${staged.length}`, asset: picked, details, categoryIds }]);
    close();
  };

  // The same form adds a new paper (at the end of the list) or edits a sent one (in place of its row, so it opens where the technician tapped).
  const renderForm = () => (
      <View style={styles.form} testID="category-evidence-form">
        <Text style={styles.formTitle}>{editing ? 'Sửa giấy tờ' : 'Thông tin giấy tờ'}</Text>
        {(picked?.uri ?? editUri) ? <EvidencePhotoStage uri={(picked?.uri ?? editUri) as string} /> : null}
        <Text style={styles.hint} numberOfLines={1}>{editing ? 'Muốn đổi ảnh thì xóa giấy tờ này rồi thêm lại.' : picked?.fileName?.trim() || 'Ảnh đã chọn'}</Text>
        <SkillEvidenceFormFields form={form} onChange={setForm} testIdPrefix="category-evidence" />
        {categories.length > 1 && (
          <View accessibilityRole="list" style={styles.groups}>
            <Text style={[styles.label, styles.fullRow]}>Áp dụng cho nhóm ({chosen.length}/{categories.length})</Text>
            {(showAllGroups ? categories : categories.slice(0, VISIBLE_GROUPS)).map((category) => {
              const checked = chosen.includes(category.id);
              return (
                <Pressable key={category.id} testID={`category-evidence-group-${category.id}`} accessibilityRole="checkbox" accessibilityLabel={category.name}
                  accessibilityState={{ checked }} onPress={() => toggleCategory(category.id)} style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
                  <View style={[styles.box, checked && styles.boxChecked]}>
                    {checked && <Check size={15} strokeWidth={3} color={colors.surface} />}
                  </View>
                  <Text style={styles.groupText}>{category.name}</Text>
                </Pressable>
              );
            })}
            {categories.length > VISIBLE_GROUPS && (
              <Pressable testID="category-evidence-groups-more" accessibilityRole="button" onPress={() => setShowAllGroups((v) => !v)} style={styles.more}>
                <Text style={styles.moreText}>{showAllGroups ? 'Thu gọn' : `Xem đủ ${categories.length} nhóm`}</Text>
              </Pressable>
            )}
          </View>
        )}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Hủy sửa giấy tờ' : 'Hủy thêm giấy tờ'} onPress={editing ? closeEdit : close}
            style={({ pressed }) => [styles.button, styles.actionButton, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Hủy</Text>
          </Pressable>
          <Pressable testID="category-evidence-confirm" accessibilityRole="button" accessibilityLabel={editing ? 'Lưu thay đổi giấy tờ' : 'Thêm giấy tờ này'} disabled={saving} onPress={editing ? () => void saveEdit() : add}
            style={({ pressed }) => [styles.button, styles.actionButton, styles.primaryButton, pressed && styles.pressed]}>
            <Text style={[styles.buttonText, styles.primaryButtonText]}>{editing ? 'Lưu thay đổi' : 'Thêm'}</Text>
          </Pressable>
        </View>
        {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      </View>
  );

  return (
    <OnboardingSection
      title="Giấy tờ chứng minh tay nghề"
      description="Không bắt buộc. Tải ảnh chụp từ bản đã công chứng và chọn nhóm dịch vụ mà giấy tờ đó chứng minh. Giấy tờ được gửi khi bạn bấm Lưu và tiếp tục."
      testID="category-evidence-section"
    >
      {sent.length > 0 && (
        <View style={styles.sent} testID="category-evidence-sent">
          <Text style={styles.label}>Giấy tờ đã nộp ({sent.length})</Text>
          {sent.map((item) => (editing?.documentId === item.documentId ? (
            <View key={item.documentId} style={styles.editCard}>{renderForm()}</View>
          ) : (
            <SentEvidenceRow key={item.documentId} item={item} disabled={disabled || saving || !!editing || !!picked} onEdit={() => startEdit(item)} onRemove={() => removeSent(item)} />
          )))}
        </View>
      )}

      {staged.length === 0 && sent.length === 0 && !picked && (
        <View style={styles.empty} accessible accessibilityLabel="Chưa có giấy tờ nào. Bạn có thể thêm sau.">
          <FileText size={24} strokeWidth={iconStroke} color={colors.textSecondary} />
          <Text style={styles.hint}>Chưa có giấy tờ nào. Bạn có thể thêm sau.</Text>
        </View>
      )}

      {staged.map((item) => (
        <View key={item.key} style={styles.item}>
          <EvidencePhotoThumb uri={item.asset.uri} />
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{SKILL_EVIDENCE_TYPE_LABEL[item.details.evidenceType]}</Text>
            <Text style={styles.hint} numberOfLines={1}>{item.asset.fileName?.trim() || 'Ảnh đã chọn'}</Text>
            {categories.length > 1 && <Text style={styles.hint}>Áp dụng cho: {nameOf(item.categoryIds) || 'nhóm đã bỏ chọn'}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Bỏ giấy tờ ${SKILL_EVIDENCE_TYPE_LABEL[item.details.evidenceType]}`}
            disabled={disabled} onPress={() => onChange(staged.filter((x) => x.key !== item.key))} style={styles.remove}>
            <Text style={styles.link}>Bỏ</Text>
          </Pressable>
        </View>
      ))}

      {!picked && !editing && staged.length < MAX_STAGED_SKILL_EVIDENCE && (
        <Pressable testID="category-evidence-add" accessibilityRole="button" accessibilityLabel="Thêm giấy tờ" disabled={disabled}
          onPress={() => void pick()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <UploadCloud size={18} strokeWidth={1.75} color={colors.primaryStrong} />
          <Text style={styles.buttonText}>Thêm giấy tờ</Text>
        </Pressable>
      )}

      {!!picked && renderForm()}

      {!!notice && !picked && !editing && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </OnboardingSection>
  );
}

/** One paper already sent: its photo (read through a short-lived link), type, issuer and the groups it covers. */
function SentEvidenceRow({ item, disabled, onEdit, onRemove }: { item: SentSkillEvidence; disabled?: boolean; onEdit: () => void; onRemove: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [uri, setUri] = useState<string | null>(null);
  const isImage = item.mimeType.startsWith('image/');
  useEffect(() => {
    if (!isImage) return;
    let live = true;
    technicianProfileApi.getSkillEvidenceAccess(item.serviceId, item.documentId).then((url) => { if (live && url) setUri(url); }, () => undefined);
    return () => { live = false; };
  }, [isImage, item.serviceId, item.documentId]);
  const title = item.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[item.evidenceType] : item.fileName;
  const shown = item.categories.slice(0, MAX_CHIPS);
  const more = item.categories.length - shown.length;
  return (
    <View style={styles.sentCard} testID={`category-evidence-sent-${item.documentId}`}>
      <View style={styles.sentTop}>
        {uri ? <EvidencePhotoThumb uri={uri} size={64} /> : <View style={styles.thumbHolder}><FileText size={22} strokeWidth={iconStroke} color={colors.textSecondary} /></View>}
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          {!!item.issuer && <Text style={styles.hint} numberOfLines={1}>{item.issuer}</Text>}
          <View style={styles.chips} accessible accessibilityLabel={`Áp dụng cho: ${item.categories.map((c) => c.name).join(', ')}`}>
            {shown.map((c) => (
              <View key={c.id} style={styles.chip}><PillText style={styles.chipText}>{c.name}</PillText></View>
            ))}
            {more > 0 && <View style={styles.chip}><PillText style={styles.chipText}>{`+${more} nhóm`}</PillText></View>}
          </View>
        </View>
      </View>
      <View style={styles.sentActions}>
        <Pressable testID={`category-evidence-edit-${item.documentId}`} accessibilityRole="button" accessibilityLabel={`Sửa giấy tờ ${title}`} disabled={disabled}
          hitSlop={4} onPress={onEdit} style={({ pressed }) => [styles.pill, disabled && styles.dim, pressed && styles.pressed]}>
          <Pencil size={15} strokeWidth={iconStroke} color={colors.primaryStrong} />
          <Text style={styles.link}>Sửa</Text>
        </Pressable>
        <Pressable testID={`category-evidence-delete-${item.documentId}`} accessibilityRole="button" accessibilityLabel={`Xóa giấy tờ ${title}`} disabled={disabled}
          hitSlop={4} onPress={onRemove} style={({ pressed }) => [styles.pill, styles.pillDanger, disabled && styles.dim, pressed && styles.pressed]}>
          <Trash2 size={15} strokeWidth={iconStroke} color={colors.tone.danger.text} />
          <Text style={[styles.link, styles.danger]}>Xóa</Text>
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  empty: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  remove: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12 },
  buttonText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  primaryButton: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  primaryButtonText: { color: colors.surface },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionButton: { flex: 1 },
  // No frame of its own: the wizard card already wraps the step, a second one made the form look nested.
  form: { gap: 8 },
  formTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  more: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  moreText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  sent: { gap: 8 },
  editCard: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primaryStrong, backgroundColor: colors.surface },
  sentCard: { gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sentTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.primarySoft },
  chipText: { color: colors.primaryStrong, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  sentActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  pill: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillDanger: { borderColor: colors.tone.danger.text },
  danger: { color: colors.tone.danger.text },
  dim: { opacity: 0.5 },
  thumbHolder: { width: 64, height: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  fullRow: { width: '100%' },
  groups: { gap: 2 },
  groupRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 21 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxChecked: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  notice: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.8 },
});
