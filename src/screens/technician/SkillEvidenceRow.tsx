import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Check, ChevronRight, UploadCloud } from 'lucide-react-native';
import { technicianProfileApi, type SentSkillEvidence, type SkillEvidenceDocument, type SkillVerification } from '../../api/technician-profile.api';
import { iconStroke, useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import {
  EMPTY_SKILL_EVIDENCE_FORM,
  SKILL_EVIDENCE_FAILED,
  SKILL_EVIDENCE_REVIEW_LABEL,
  SKILL_EVIDENCE_SENT,
  SKILL_STATUS_LABEL,
  SKILL_EVIDENCE_TYPE_LABEL,
  sendSkillEvidence,
  skillEvidenceDetails,
  skillEvidenceFormProblem,
  skillEvidenceProblem,
  type SkillEvidenceAsset,
  type SkillEvidenceForm,
} from './skill-evidence';
import SkillEvidenceFormFields from './SkillEvidenceFormFields';
import EvidenceDetailModal, { evidenceFactLines } from './EvidenceDetailModal';
import type { StatusView } from './technician-status';

const SKILL_VIEW: Record<'pending' | 'verified' | 'rejected', StatusView> = {
  pending: { label: SKILL_STATUS_LABEL.pending, tone: 'warning', icon: 'Clock' },
  verified: { label: SKILL_STATUS_LABEL.verified, tone: 'success', icon: 'CheckCircle2' },
  rejected: { label: SKILL_STATUS_LABEL.rejected, tone: 'danger', icon: 'XCircle' },
};
const REVIEW_TONE = { pending: 'warning', valid: 'success', invalid: 'danger', need_more: 'warning' } as const;

/**
 * The certificate step of one service on the technician skills page (web TechnicianProfilePage): shown for a service the
 * technician takes and FixHome has not approved yet. After a photo is picked the technician says what the paper is
 * (type, issuer, dates) so the reviewer can weigh it; a refused certificate shows its reason on request.
 */
export default function SkillEvidenceRow({ serviceId, serviceName, status, onChanged, showReasonNow }: {
  serviceId: string;
  serviceName: string;
  status: 'pending' | 'verified' | 'rejected';
  onChanged: () => void;
  /** Read the refusal reason and sent papers on mount, so a rejected skill shows why without a tap. */
  showReasonNow?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [picked, setPicked] = useState<SkillEvidenceAsset | null>(null);
  const [form, setForm] = useState<SkillEvidenceForm>(EMPTY_SKILL_EVIDENCE_FORM);
  const [sent, setSent] = useState<SkillVerification | null>(null);
  const [sentError, setSentError] = useState('');
  // Papers the technician already sent: picked again instead of uploaded twice.
  const [library, setLibrary] = useState<SentSkillEvidence[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  const holds = (paper: SentSkillEvidence) => !!paper.serviceIds?.includes(serviceId);

  const openAdd = async () => {
    if (busy) return;
    setNotice('');
    let papers: SentSkillEvidence[] = [];
    try { papers = await technicianProfileApi.getMySkillEvidence(); } catch { /* no list: the technician uploads a new one */ }
    setLibrary(papers);
    if (papers.some((paper) => !holds(paper))) { setChosen([]); setChoosing(true); } else void pick();
  };

  const reuse = async () => {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setNotice('');
    try {
      const { attached, skipped } = await technicianProfileApi.reuseSkillEvidence(serviceId, chosen);
      setChoosing(false);
      setChosen([]);
      setSent(null);
      const skippedNote = skipped > 0 ? ` ${skipped} giấy tờ đã có nên bỏ qua.` : '';
      setNotice(status === 'rejected'
        ? `Đã thêm giấy tờ. Bấm Gửi lại để xét duyệt khi bạn sẵn sàng.${skippedNote}`
        : `Đã thêm ${attached} giấy tờ.${skippedNote}`);
      if (status === 'rejected') void showSent();
      onChanged();
    } catch (err) {
      setNotice(extractApiErrorMessage(err, SKILL_EVIDENCE_FAILED));
    } finally { setBusy(false); }
  };

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
    const number = form.referenceNumber.trim().toLowerCase();
    if (number && library?.some((paper) => holds(paper) && paper.evidenceType === form.evidenceType && (paper.referenceNumber ?? '').trim().toLowerCase() === number)) {
      setNotice('Bạn đã có giấy tờ này ở kỹ năng này. Hãy chọn từ giấy tờ đã up thay vì tải lại.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await sendSkillEvidence(serviceId, picked, skillEvidenceDetails(form));
      setPicked(null);
      setForm(EMPTY_SKILL_EVIDENCE_FORM);
      setSent(null);
      // A refused skill stays refused until the technician sends it back: the new paper only waits for that.
      if (status === 'rejected') {
        setNotice('Đã thêm giấy tờ. Bấm Gửi lại để xét duyệt khi bạn sẵn sàng.');
        void showSent();
      } else {
        setNotice(SKILL_EVIDENCE_SENT);
      }
      onChanged();
    } catch {
      setNotice(SKILL_EVIDENCE_FAILED);
    } finally { setBusy(false); }
  };

  const removeDoc = (doc: SkillEvidenceDocument) => Alert.alert(
    'Xóa giấy tờ này?',
    `Gỡ giấy tờ này khỏi kỹ năng ${serviceName}? Các kỹ năng khác vẫn giữ giấy tờ.`,
    [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          technicianProfileApi.deleteSkillEvidenceFromSkill(serviceId, doc.id).then(
            () => { setNotice(''); void showSent(); onChanged(); },
            (err) => Alert.alert('Không xóa được giấy tờ', extractApiErrorMessage(err, 'Vui lòng thử lại.')),
          );
        },
      },
    ],
  );

  const showSent = async () => {
    setSentError('');
    try {
      setSent(await technicianProfileApi.getSkillVerification(serviceId) ?? { id: '', status, rejectionReason: null, documents: [] });
    } catch { setSentError('Chưa tải được giấy tờ đã gửi. Vui lòng thử lại.'); }
  };

  useEffect(() => {
    if (showReasonNow && status === 'rejected') void showSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap}>
      {choosing && !picked && (
        <View style={styles.form} testID={`skill-evidence-choose-${serviceId}`}>
          <Text style={styles.formTitle}>Chọn giấy tờ đã up</Text>
          <Text style={styles.hint}>Dùng lại giấy tờ bạn đã gửi, không cần tải ảnh lên lần nữa.</Text>
          {(library ?? []).map((paper) => {
            const has = holds(paper);
            const on = chosen.includes(paper.documentId);
            const title = paper.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[paper.evidenceType] : paper.fileName;
            const details = [paper.issuer, paper.referenceNumber].filter(Boolean).join(' · ');
            return (
              <Pressable key={paper.documentId} testID={`skill-evidence-choice-${paper.documentId}`} accessibilityRole="checkbox" accessibilityLabel={`${title}${has ? ', đã có ở kỹ năng này' : ''}`}
                accessibilityState={{ checked: on, disabled: has }} disabled={has}
                onPress={() => setChosen((cur) => (on ? cur.filter((id) => id !== paper.documentId) : [...cur, paper.documentId]))}
                style={({ pressed }) => [styles.choice, has && styles.dim, pressed && styles.pressed]}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} strokeWidth={2.5} color={colors.surface} /> : null}</View>
                <View style={styles.sentBody}>
                  <Text style={styles.sentTitle}>{title}</Text>
                  {!!details && <Text style={styles.hint} numberOfLines={1}>{details}</Text>}
                </View>
                {has ? <Text style={styles.hint}>Đã có</Text> : null}
              </Pressable>
            );
          })}
          <View style={styles.actions}>
            <Pressable testID={`skill-evidence-choose-new-${serviceId}`} accessibilityRole="button" accessibilityLabel="Tải ảnh mới" disabled={busy}
              onPress={() => { setChoosing(false); void pick(); }} style={({ pressed }) => [styles.button, styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Tải ảnh mới</Text>
            </Pressable>
            <Pressable testID={`skill-evidence-choose-add-${serviceId}`} accessibilityRole="button" accessibilityLabel="Thêm giấy tờ đã chọn" accessibilityState={{ disabled: busy || chosen.length === 0, busy }}
              disabled={busy || chosen.length === 0} onPress={() => void reuse()}
              style={({ pressed }) => [styles.button, styles.actionButton, styles.primaryButton, (busy || chosen.length === 0) && styles.dim, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator size="small" color={colors.surface} /> : null}
              <Text style={[styles.buttonText, styles.primaryButtonText]}>{chosen.length ? `Thêm ${chosen.length} giấy tờ` : 'Thêm giấy tờ'}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn giấy tờ" onPress={() => setChoosing(false)}>
            <Text style={styles.link}>Hủy</Text>
          </Pressable>
        </View>
      )}

      {!!picked && (
        <View style={styles.form} testID={`skill-evidence-form-${serviceId}`}>
          <Text style={styles.formTitle}>Thông tin giấy tờ</Text>
          <Text style={styles.hint} numberOfLines={1}>{picked.fileName?.trim() || 'Ảnh đã chọn'}</Text>
          <SkillEvidenceFormFields form={form} onChange={setForm} labelSuffix={serviceName} testIdPrefix="skill-evidence" />
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
      {!!sent && <SentList serviceId={serviceId} documents={sent.documents} status={sent.status} rejectionReason={sent.rejectionReason} onDelete={sent.status === 'verified' ? undefined : removeDoc} styles={styles} colors={colors} />}
      {!picked && !choosing && (
        <Pressable testID={`skill-evidence-upload-${serviceId}`} accessibilityRole="button" accessibilityLabel={`Thêm giấy tờ ${serviceName}`}
          accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void openAdd()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <UploadCloud size={18} strokeWidth={1.75} color={colors.primaryStrong} />
          <Text style={styles.buttonText}>Thêm giấy tờ</Text>
        </Pressable>
      )}

      {!!sentError && <Text accessibilityRole="alert" style={styles.reason}>{sentError}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
  );
}

function SentList({ serviceId, documents, status, rejectionReason, onDelete, styles, colors }: {
  serviceId: string;
  documents: SkillEvidenceDocument[];
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason: string | null;
  /** Absent once the skill is approved: the papers that approved it cannot be removed. */
  onDelete?: (doc: SkillEvidenceDocument) => void;
  styles: ReturnType<typeof getStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  const [open, setOpen] = useState<SkillEvidenceDocument | null>(null);
  if (!documents.length) return <Text style={styles.hint}>Bạn chưa gửi giấy tờ nào.</Text>;
  const titleOf = (doc: SkillEvidenceDocument) => (doc.evidenceType ? SKILL_EVIDENCE_TYPE_LABEL[doc.evidenceType] : doc.fileName || 'Giấy tờ');
  return (
    <View style={styles.sentList}>
      {documents.map((doc) => {
        const review = doc.reviewStatus ?? 'pending';
        const details = evidenceFactLines(doc).map((l) => l.value).join(' · ');
        return (
          <Pressable key={doc.id} testID={`skill-evidence-open-${doc.id}`} accessibilityRole="button" accessibilityLabel={`Xem chi tiết giấy tờ ${titleOf(doc)}`}
            onPress={() => setOpen(doc)} style={({ pressed }) => [styles.sentItem, pressed && styles.pressed]}>
            <View style={styles.sentBody}>
              <Text style={styles.sentTitle}>{titleOf(doc)}</Text>
              {!!details && <Text style={styles.hint} numberOfLines={1}>{details}</Text>}
              {/* Nothing sets a per-paper review yet, so "pending" says nothing the skill status does not: only a real verdict is shown. */}
              {review !== 'pending' && <Text style={[styles.sentStatus, { color: colors.tone[REVIEW_TONE[review]].text }]}>{SKILL_EVIDENCE_REVIEW_LABEL[review]}</Text>}
              {!!doc.reviewNote && <Text style={styles.hint}>{doc.reviewNote}</Text>}
            </View>
            <ChevronRight size={18} strokeWidth={iconStroke} color={colors.textSecondary} />
          </Pressable>
        );
      })}
      <EvidenceDetailModal
        visible={!!open}
        title={open ? titleOf(open) : ''}
        photo={open ? { serviceId, documentId: open.id } : null}
        facts={open ? evidenceFactLines(open) : []}
        status={SKILL_VIEW[status]}
        reason={rejectionReason}
        note={open?.reviewNote}
        onDelete={open && onDelete ? () => { const doc = open; setOpen(null); onDelete(doc); } : undefined}
        onClose={() => setOpen(null)}
      />
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
  sentBody: { flex: 1, minWidth: 0, gap: 2 },
  sentItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sentTitle: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  sentStatus: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600', paddingVertical: 4 },
  reason: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19 },
  notice: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
