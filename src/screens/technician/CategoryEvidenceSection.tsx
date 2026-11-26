import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Check, FileText, UploadCloud } from 'lucide-react-native';
import { technicianProfileApi, type SentSkillEvidence } from '../../api/technician-profile.api';
import { iconStroke, useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import PillText from '../../components/PillText';
import StatusBadge from '../../components/StatusBadge';
import type { StatusView } from './technician-status';
import { EvidencePhotoStage, EvidencePhotoThumb } from '../../components/technician/EvidencePhotoPreview';
import OnboardingSection from './OnboardingSection';
import EvidenceDetailModal, { evidenceFactLines } from './EvidenceDetailModal';
import SkillEvidenceFormFields from './SkillEvidenceFormFields';
import {
  EMPTY_SKILL_EVIDENCE_FORM,
  MAX_STAGED_SKILL_EVIDENCE,
  SKILL_EVIDENCE_TYPE_LABEL,
  skillEvidenceCategoriesProblem,
  skillEvidenceDetails,
  skillEvidenceFormProblem,
  skillEvidenceProblem,
  sendCategoryEvidence,
  SKILL_EVIDENCE_FAILED,
  type EvidenceCategory,
  type SkillEvidenceAsset,
  type SkillEvidenceForm,
  type StagedSkillEvidence,
} from './skill-evidence';

/** Badge and lock text per paper status; `editable` stands in when an older backend sends no status. */
const EVIDENCE_STATUS: Record<NonNullable<SentSkillEvidence['status']>, { view: StatusView; lock?: string }> = {
  pending: { view: { label: 'Chờ duyệt', tone: 'warning', icon: 'Clock' } },
  rejected: { view: { label: 'Kỹ năng bị từ chối', tone: 'danger', icon: 'XCircle' } },
  in_review: { view: { label: 'Đang xét duyệt', tone: 'info', icon: 'Clock' }, lock: 'Hồ sơ đang chờ xét duyệt, chưa sửa được.' },
  approved: { view: { label: 'Đã dùng để duyệt', tone: 'success', icon: 'CheckCircle2' }, lock: 'Đã dùng để duyệt kỹ năng, không sửa hoặc xóa được.' },
};
const STATUS_ORDER = ['rejected', 'pending', 'in_review', 'approved'] as const;
const STATUS_GROUP_TITLE: Record<(typeof STATUS_ORDER)[number], string> = {
  rejected: 'Cần xử lý',
  pending: 'Chờ duyệt',
  in_review: 'Đang xét duyệt',
  approved: 'Đã dùng để duyệt',
};
const evidenceStatusOf = (item: SentSkillEvidence) => item.status ?? (item.editable === false ? 'approved' : 'pending');

const VISIBLE_GROUPS = 4;
/** Groups named on a sent paper before the rest fold into "+n nhóm". */
const MAX_CHIPS = 3;

/**
 * End of step 3 of the technician registration: papers that prove the skills just chosen (PO 24/11/2026). Each paper
 * covers the categories the technician ticks (none to start with, at least one is needed), so a paper for air conditioners does not
 * vouch for electrical work. The papers wait here and are sent after "Lưu và tiếp tục" saves the skills.
 */
export default function CategoryEvidenceSection({ staged, categories, onChange, disabled, refreshKey = 0, sendNow, onSent }: {
  staged: StagedSkillEvidence[];
  /** The categories of the services chosen above; the only ones a paper may cover. */
  categories: EvidenceCategory[];
  onChange: (next: StagedSkillEvidence[]) => void;
  disabled?: boolean;
  /** Change it to read the papers already sent again (after a save). */
  refreshKey?: number;
  /** After approval there is no "Lưu và tiếp tục": a new paper is sent as soon as it is confirmed. */
  sendNow?: boolean;
  onSent?: () => void;
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

  /** Asks for a photo; null when the technician cancels or the photo is refused (the reason goes to the notice). */
  const choosePhoto = async (): Promise<SkillEvidenceAsset | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh trong Cài đặt để chọn ảnh giấy tờ.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (!asset) return null;
    const file = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize };
    const problem = skillEvidenceProblem(file);
    if (problem) { setNotice(problem); return null; }
    setNotice('');
    return file;
  };

  const pick = async () => {
    const file = await choosePhoto();
    if (!file) return;
    setForm(EMPTY_SKILL_EVIDENCE_FORM);
    // Nothing ticked to start with when there is a choice, so the technician says which groups the paper proves.
    setChosen(categories.length > 1 ? [] : categories.map((c) => c.id));
    setPicked(file);
  };

  const close = () => { setPicked(null); setForm(EMPTY_SKILL_EVIDENCE_FORM); setNotice(''); };

  // A paper already sent is not edited (it is shared by several skills): the technician deletes it and sends a new one.
  const [saving, setSaving] = useState(false);
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

  const add = async () => {
    if (!picked || saving) return;
    const categoryIds = categories.filter((c) => chosen.includes(c.id)).map((c) => c.id);
    const problem = skillEvidenceFormProblem(form) ?? skillEvidenceCategoriesProblem(categoryIds);
    const details = skillEvidenceDetails(form);
    if (problem || !details) { setNotice(problem ?? ''); return; }
    // Same type and number already on every chosen group: a second copy changes nothing (the server refuses it too).
    const number = (details.referenceNumber ?? '').trim().toLowerCase();
    if (number && sent.some((p) => p.evidenceType === details.evidenceType && (p.referenceNumber ?? '').trim().toLowerCase() === number && categoryIds.every((id) => p.categories.some((cat) => cat.id === id)))) {
      setNotice('Bạn đã nộp giấy tờ này cho các nhóm đã chọn (cùng loại, cùng số hiệu). Không cần tải lại.');
      return;
    }
    if (sendNow) {
      setSaving(true);
      try {
        await sendCategoryEvidence(categoryIds, picked, details);
        close();
        setReloadTick((n) => n + 1);
        onSent?.();
      } catch (err) {
        setNotice(extractApiErrorMessage(err, err instanceof Error && err.message ? err.message : SKILL_EVIDENCE_FAILED));
      } finally {
        setSaving(false);
      }
      return;
    }
    onChange([...staged, { key: `${Date.now()}-${staged.length}`, asset: picked, details, categoryIds }]);
    close();
  };

  // The form adds a new paper at the end of the list.
  const renderForm = () => (
      <View style={styles.form} testID="category-evidence-form">
        <Text style={styles.formTitle}>Thông tin giấy tờ</Text>
        {picked?.uri ? <EvidencePhotoStage uri={picked.uri} /> : null}
        <Text style={styles.hint} numberOfLines={1}>{picked?.fileName?.trim() || 'Ảnh đã chọn'}</Text>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Hủy thêm giấy tờ" onPress={close}
            style={({ pressed }) => [styles.button, styles.actionButton, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Hủy</Text>
          </Pressable>
          <Pressable testID="category-evidence-confirm" accessibilityRole="button" accessibilityLabel={sendNow ? 'Gửi giấy tờ này' : 'Thêm giấy tờ này'} disabled={saving} onPress={() => void add()}
            style={({ pressed }) => [styles.button, styles.actionButton, styles.primaryButton, pressed && styles.pressed]}>
            <Text style={[styles.buttonText, styles.primaryButtonText]}>{sendNow ? (saving ? 'Đang gửi…' : 'Gửi giấy tờ') : 'Thêm'}</Text>
          </Pressable>
        </View>
        {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      </View>
  );

  return (
    <OnboardingSection
      title="Giấy tờ chứng minh tay nghề"
      description={sendNow
        ? 'Tải ảnh chụp từ bản đã công chứng và chọn nhóm dịch vụ mà giấy tờ đó chứng minh. Giấy tờ được gửi ngay khi bạn xác nhận.'
        : 'Không bắt buộc. Tải ảnh chụp từ bản đã công chứng và chọn nhóm dịch vụ mà giấy tờ đó chứng minh. Giấy tờ được gửi khi bạn bấm Lưu và tiếp tục.'}
      testID="category-evidence-section"
    >
      {sent.length > 0 && (
        <View style={styles.sent} testID="category-evidence-sent">
          <Text style={styles.label}>Giấy tờ đã nộp ({sent.length})</Text>
          {(sendNow ? [...sent].sort((a, b) => STATUS_ORDER.indexOf(evidenceStatusOf(a)) - STATUS_ORDER.indexOf(evidenceStatusOf(b))) : sent).map((item, index, list) => {
            const status = evidenceStatusOf(item);
            const first = sendNow && (index === 0 || evidenceStatusOf(list[index - 1]) !== status);
            return (
              <React.Fragment key={item.documentId}>
                {first && <Text style={styles.groupTitle} accessibilityRole="header" testID={`category-evidence-heading-${status}`}>{`${STATUS_GROUP_TITLE[status]} (${list.filter((x) => evidenceStatusOf(x) === status).length})`}</Text>}
                <SentEvidenceRow item={item} disabled={disabled || saving || !!picked} onRemove={() => removeSent(item)} />
              </React.Fragment>
            );
          })}
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

      {!picked && staged.length < MAX_STAGED_SKILL_EVIDENCE && (!sendNow || categories.length > 0) && (
        <Pressable testID="category-evidence-add" accessibilityRole="button" accessibilityLabel="Thêm giấy tờ" disabled={disabled}
          onPress={() => void pick()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <UploadCloud size={18} strokeWidth={1.75} color={colors.primaryStrong} />
          <Text style={styles.buttonText}>Thêm giấy tờ</Text>
        </Pressable>
      )}

      {!!picked && renderForm()}

      {sendNow && categories.length === 0 && !picked && (
        <Text style={styles.hint}>Mọi kỹ năng đang nhận đã được duyệt nên không cần thêm giấy tờ. Bật thêm dịch vụ mới để gửi giấy tờ cho dịch vụ đó.</Text>
      )}

      {!!notice && !picked && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </OnboardingSection>
  );
}

/** One paper already sent: its photo (read through a short-lived link), type, issuer and the groups it covers. */
function SentEvidenceRow({ item, disabled, onRemove }: { item: SentSkillEvidence; disabled?: boolean; onRemove: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [uri, setUri] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const isImage = item.mimeType.startsWith('image/');
  useEffect(() => {
    if (!isImage) return;
    let live = true;
    technicianProfileApi.getSkillEvidenceAccess(item.serviceId, item.documentId).then((url) => { if (live && url) setUri(url); }, () => undefined);
    return () => { live = false; };
  }, [isImage, item.serviceId, item.documentId]);
  const title = item.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[item.evidenceType] : item.fileName;
  const { view, lock } = EVIDENCE_STATUS[evidenceStatusOf(item)];
  const shown = item.categories.slice(0, MAX_CHIPS);
  const more = item.categories.length - shown.length;
  return (
    <Pressable style={({ pressed }) => [styles.sentCard, pressed && styles.pressed]} testID={`category-evidence-sent-${item.documentId}`} accessibilityRole="button"
      accessibilityLabel={`Xem chi tiết giấy tờ ${title}`} onPress={() => setDetail(true)}>
      <View style={styles.sentTop}>
        {uri ? <EvidencePhotoThumb uri={uri} size={64} /> : <View style={styles.thumbHolder}><FileText size={22} strokeWidth={iconStroke} color={colors.textSecondary} /></View>}
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          {!!item.issuer && <Text style={styles.hint} numberOfLines={1}>{item.issuer}</Text>}
          <View testID={lock ? `category-evidence-locked-${item.documentId}` : undefined} accessible={!!lock} accessibilityLabel={lock ? `${view.label}. ${lock}` : undefined}><StatusBadge view={view} /></View>
          {item.status === 'rejected' && (
            <Text style={styles.hint} testID={`category-evidence-reason-${item.documentId}`}>
              {item.rejectionReason ? `Lý do từ chối: ${item.rejectionReason}. ` : ''}Bấm Gửi lại để xét duyệt khi bạn sẵn sàng.
            </Text>
          )}
          <View style={styles.chips} accessible accessibilityLabel={`Áp dụng cho: ${item.categories.map((c) => c.name).join(', ')}`}>
            {shown.map((c) => (
              <View key={c.id} style={styles.chip}><PillText style={styles.chipText}>{c.name}</PillText></View>
            ))}
            {more > 0 && <View style={styles.chip}><PillText style={styles.chipText}>{`+${more} nhóm`}</PillText></View>}
          </View>
        </View>
      </View>
      <EvidenceDetailModal
        visible={detail}
        title={title}
        photo={isImage ? { serviceId: item.serviceId, documentId: item.documentId } : null}
        facts={evidenceFactLines(item)}
        status={view}
        reason={item.rejectionReason}
        note={lock}
        categories={item.categories.map((c) => c.name)}
        onDelete={lock || disabled ? undefined : () => { setDetail(false); onRemove(); }}
        onClose={() => setDetail(false)}
      />
    </Pressable>
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
  groupTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: 4 },
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
