// A technician's certificate for one service (web TechnicianProfilePage handleUploadEvidence): ask for a signed upload
// slot, put the file straight to storage, then attach it to the service's verification. Photos only on the phone.
import {
  SKILL_EVIDENCE_TYPE_VALUES,
  technicianProfileApi,
  type SentSkillEvidence,
  type SkillEvidenceDetails,
  type SkillEvidenceReviewStatus,
  type SkillEvidenceType,
  type SkillVerification,
  type UploadedEvidenceFile,
} from '../../api/technician-profile.api';
import { technicianVerificationApi, type KycMimeType } from '../../api/technician-verification.api';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { vnParts } from '../../utils/vn-time';

export const SKILL_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const SKILL_EVIDENCE_SENT = 'Đã gửi chứng chỉ. FixHome sẽ xem xét.';
export const SKILL_EVIDENCE_FAILED = 'Không thể gửi chứng chỉ. Vui lòng thử lại.';
export const SKILL_STATUS_LABEL: Record<'pending' | 'verified' | 'rejected', string> = {
  pending: 'Chờ duyệt',
  verified: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

export interface SkillEvidenceAsset { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null }

export const SKILL_EVIDENCE_TYPE_LABEL: Record<SkillEvidenceType, string> = {
  national_skill_certificate: 'Chứng chỉ kỹ năng nghề quốc gia',
  vocational_diploma: 'Bằng trung cấp hoặc cao đẳng nghề',
  electrical_safety_card: 'Thẻ an toàn điện',
  manufacturer_training: 'Chứng nhận đào tạo của hãng',
  employer_confirmation: 'Xác nhận của nơi làm cũ',
  social_insurance: 'Sổ bảo hiểm xã hội',
  work_photos: 'Ảnh công trình đã làm',
  other: 'Giấy tờ khác',
};

/** Same wording as the reviewer's verdicts on web. */
export const SKILL_EVIDENCE_REVIEW_LABEL: Record<SkillEvidenceReviewStatus, string> = {
  pending: 'Chờ xem xét',
  valid: 'Hợp lệ',
  invalid: 'Không hợp lệ',
  need_more: 'Cần bổ sung',
};

export const SKILL_EVIDENCE_TYPES: readonly SkillEvidenceType[] = SKILL_EVIDENCE_TYPE_VALUES;

export type SkillEvidenceField = 'issuer' | 'referenceNumber' | 'issuedAt' | 'expiresAt' | 'claimedYears';

/** Which details make sense for a type: an issued paper has issuer, number and dates; a confirmation has who and for how long. */
export function skillEvidenceFields(type: SkillEvidenceType | null): SkillEvidenceField[] {
  switch (type) {
    case 'national_skill_certificate':
    case 'vocational_diploma':
    case 'electrical_safety_card':
    case 'manufacturer_training':
      return ['issuer', 'referenceNumber', 'issuedAt', 'expiresAt'];
    case 'employer_confirmation':
    case 'social_insurance':
      return ['issuer', 'issuedAt', 'claimedYears'];
    case null:
      return [];
    default:
      return ['claimedYears'];
  }
}

export interface SkillEvidenceForm {
  evidenceType: SkillEvidenceType | null;
  issuer: string;
  referenceNumber: string;
  /** `dd/MM/yyyy` as typed. */
  issuedAt: string;
  expiresAt: string;
  claimedYears: string;
}

export const EMPTY_SKILL_EVIDENCE_FORM: SkillEvidenceForm = {
  evidenceType: null, issuer: '', referenceNumber: '', issuedAt: '', expiresAt: '', claimedYears: '',
};

/** Fills the form from a paper already sent, to edit it (dates back to `dd/MM/yyyy`). */
export function skillEvidenceFormFromSent(item: SentSkillEvidence): SkillEvidenceForm {
  return {
    evidenceType: item.evidenceType,
    issuer: item.issuer ?? '',
    referenceNumber: item.referenceNumber ?? '',
    issuedAt: item.issuedAt ? isoToViDate(item.issuedAt) : '',
    expiresAt: item.expiresAt ? isoToViDate(item.expiresAt) : '',
    claimedYears: item.claimedYears == null ? '' : String(item.claimedYears),
  };
}

/** `dd/MM/yyyy` to `YYYY-MM-DD`; null when it is not a real calendar date. */
export function parseViDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` to `dd/MM/yyyy`; anything else is shown as sent. */
export function isoToViDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const vnToday = (): string => {
  const p = vnParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** The first reason the form cannot be sent, or null. Backend repeats the checks that matter. */
export function skillEvidenceFormProblem(form: SkillEvidenceForm, today: string = vnToday()): string | null {
  if (!form.evidenceType) return 'Chọn loại giấy tờ.';
  const fields = skillEvidenceFields(form.evidenceType);
  const issued = fields.includes('issuedAt') && form.issuedAt.trim() ? parseViDate(form.issuedAt) : undefined;
  const expires = fields.includes('expiresAt') && form.expiresAt.trim() ? parseViDate(form.expiresAt) : undefined;
  if (issued === null) return 'Ngày cấp chưa đúng. Nhập theo dạng dd/MM/yyyy.';
  if (expires === null) return 'Ngày hết hạn chưa đúng. Nhập theo dạng dd/MM/yyyy.';
  if (issued && issued > today) return 'Ngày cấp không được sau hôm nay.';
  if (issued && expires && expires < issued) return 'Ngày hết hạn không được trước ngày cấp.';
  if (expires && expires < today) return 'Giấy tờ đã hết hạn.';
  if (fields.includes('claimedYears') && form.claimedYears.trim()) {
    const years = Number(form.claimedYears);
    if (!Number.isInteger(years) || years < 0 || years > 60) return 'Số năm kinh nghiệm từ 0 đến 60.';
  }
  return null;
}

/** The details to send: only the fields the type shows, trimmed, empty ones left out. Call after `skillEvidenceFormProblem` is null. */
export function skillEvidenceDetails(form: SkillEvidenceForm): SkillEvidenceDetails | undefined {
  if (!form.evidenceType) return undefined;
  const fields = skillEvidenceFields(form.evidenceType);
  const details: SkillEvidenceDetails = { evidenceType: form.evidenceType };
  if (fields.includes('issuer') && form.issuer.trim()) details.issuer = form.issuer.trim();
  if (fields.includes('referenceNumber') && form.referenceNumber.trim()) details.referenceNumber = form.referenceNumber.trim();
  if (fields.includes('issuedAt') && form.issuedAt.trim()) details.issuedAt = parseViDate(form.issuedAt) ?? undefined;
  if (fields.includes('expiresAt') && form.expiresAt.trim()) details.expiresAt = parseViDate(form.expiresAt) ?? undefined;
  if (fields.includes('claimedYears') && form.claimedYears.trim()) details.claimedYears = Number(form.claimedYears);
  return details;
}

const BY_EXTENSION: Record<string, KycMimeType> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** The picker's own type when it is one Backend takes, else the file extension; null when it is neither. */
export function skillEvidenceMime(asset: Pick<SkillEvidenceAsset, 'uri' | 'mimeType' | 'fileName'>): KycMimeType | null {
  if (asset.mimeType && MIME_TYPES.includes(asset.mimeType)) return asset.mimeType as KycMimeType;
  const extension = (asset.fileName ?? asset.uri).split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? null;
}

/** Why a picked file cannot be sent, or null. */
export function skillEvidenceProblem(asset: SkillEvidenceAsset): string | null {
  if (!skillEvidenceMime(asset)) return 'Chọn ảnh JPG, PNG hoặc WebP.';
  if (asset.fileSize != null && asset.fileSize > SKILL_EVIDENCE_MAX_BYTES) return 'Ảnh tối đa 10 MB.';
  return null;
}

/** Three steps, as on web; a failure at any step means nothing was attached. */
export async function sendSkillEvidence(serviceId: string, asset: SkillEvidenceAsset, details?: SkillEvidenceDetails): Promise<SkillVerification> {
  const problem = skillEvidenceProblem(asset);
  const mimeType = skillEvidenceMime(asset);
  if (problem || !mimeType) throw new Error(problem ?? SKILL_EVIDENCE_FAILED);
  const slot = await technicianProfileApi.requestSkillEvidenceUploadUrl(serviceId, mimeType);
  await technicianVerificationApi.uploadToSignedUrl(slot.uploadUrl, mimeType, { uri: asset.uri });
  return technicianProfileApi.attachSkillEvidence(serviceId, {
    storageObjectPath: slot.storageObjectPath,
    fileName: asset.fileName?.trim() || `chung-chi.${mimeType.slice(6)}`,
    fileSize: asset.fileSize ?? 0,
    mimeType,
    ...details,
  });
}

// ── Giấy tờ theo nhóm dịch vụ, gửi từ bước 3 đăng ký thợ ─────────────────────────────────────────────────

/** Tối đa giấy tờ chờ gửi trong một lần đăng ký (như số ảnh chứng chỉ ở KYC trước đây). */
export const MAX_STAGED_SKILL_EVIDENCE = 5;

export interface EvidenceCategory { id: string; name: string }

/**
 * A paper the technician picked at step 3, with the categories it proves (all of them unless the technician narrowed it).
 * It is sent once the skills are saved, because the skills do not exist before.
 */
export interface StagedSkillEvidence {
  key: string;
  asset: SkillEvidenceAsset;
  details: SkillEvidenceDetails;
  categoryIds: string[];
}

/** A paper must prove at least one category. */
export function skillEvidenceCategoriesProblem(categoryIds: readonly string[]): string | null {
  return categoryIds.length === 0 ? 'Chọn ít nhất một nhóm cho giấy tờ này.' : null;
}

/** The categories of the services currently selected, in the order they first appear; the only ones a paper may cover. */
export function selectedEvidenceCategories(
  services: { id: string; categoryId: string; categoryName?: string | null }[],
  selectedIds: string[],
  categoryNames: ReadonlyMap<string, string>,
): EvidenceCategory[] {
  const found = new Map<string, string>();
  for (const service of services) {
    if (!selectedIds.includes(service.id) || found.has(service.categoryId)) continue;
    found.set(service.categoryId, service.categoryName ?? categoryNames.get(service.categoryId) ?? 'Khác');
  }
  return Array.from(found, ([id, name]) => ({ id, name }));
}

/** Gets an upload slot and uploads the photo; the result names the stored file for the request that follows. */
export async function uploadCategoryPhoto(asset: SkillEvidenceAsset): Promise<UploadedEvidenceFile> {
  const problem = skillEvidenceProblem(asset);
  const mimeType = skillEvidenceMime(asset);
  if (problem || !mimeType) throw new Error(problem ?? SKILL_EVIDENCE_FAILED);
  const slot = await technicianProfileApi.requestCategoryEvidenceUploadUrl(mimeType);
  await technicianVerificationApi.uploadToSignedUrl(slot.uploadUrl, mimeType, { uri: asset.uri });
  return {
    storageObjectPath: slot.storageObjectPath,
    fileName: asset.fileName?.trim() || `chung-chi.${mimeType.slice(6)}`,
    fileSize: asset.fileSize ?? 0,
    mimeType,
  };
}

/** Same three steps as `sendSkillEvidence`, for a paper that covers several categories; nothing is attached if one fails. */
export async function sendCategoryEvidence(categoryIds: string[], asset: SkillEvidenceAsset, details: SkillEvidenceDetails): Promise<number> {
  const file = await uploadCategoryPhoto(asset);
  const result = await technicianProfileApi.attachCategoryEvidence(categoryIds, { ...file, ...details });
  return result.attachedSkills;
}

/**
 * Sends the waiting papers one by one (never in parallel: Backend opens one request per skill), each to its own categories
 * that still have a chosen service (`categoryIds` is all of those); returns the ones that failed, which includes a paper
 * whose categories were all dropped since it was added.
 */
export async function sendStagedEvidence(staged: StagedSkillEvidence[], categoryIds: string[]): Promise<{ failed: StagedSkillEvidence[]; reason: string | null }> {
  const failed: StagedSkillEvidence[] = [];
  let reason: string | null = null;
  for (const item of staged) {
    try {
      const own = item.categoryIds.filter((id) => categoryIds.includes(id));
      const problem = skillEvidenceCategoriesProblem(own);
      if (problem) throw new Error(problem);
      await sendCategoryEvidence(own, item.asset, item.details);
    } catch (err) {
      failed.push(item);
      reason ??= extractApiErrorMessage(err, err instanceof Error && err.message ? err.message : SKILL_EVIDENCE_FAILED);
    }
  }
  return { failed, reason };
}

// ── Giấy tờ chờ của MỘT kỹ năng chưa đăng ký, gửi ngay sau khi lưu kỹ năng ──────────────────────────────

/** Giấy tờ thợ chọn trước khi bật kỹ năng: dùng lại giấy tờ đã up, hoặc ảnh mới kèm thông tin. */
export type StagedSkillPaper =
  | { kind: 'reuse'; paper: SentSkillEvidence }
  | { kind: 'new'; asset: SkillEvidenceAsset; form: SkillEvidenceForm };

/** Gửi giấy tờ chờ cho kỹ năng vừa lưu (backend mở phiếu khi lưu): dùng lại một lượt, ảnh mới lần lượt; trả số giấy tờ lỗi. */
export async function sendStagedSkillPapers(serviceId: string, items: StagedSkillPaper[]): Promise<{ failed: number; reason: string | null }> {
  let failed = 0;
  let reason: string | null = null;
  const reuseIds = items.flatMap((i) => (i.kind === 'reuse' ? [i.paper.documentId] : []));
  if (reuseIds.length) {
    try { await technicianProfileApi.reuseSkillEvidence(serviceId, reuseIds); } catch (err) {
      failed += reuseIds.length;
      reason ??= extractApiErrorMessage(err, SKILL_EVIDENCE_FAILED);
    }
  }
  for (const item of items) {
    if (item.kind !== 'new') continue;
    try { await sendSkillEvidence(serviceId, item.asset, skillEvidenceDetails(item.form)); } catch (err) {
      failed += 1;
      reason ??= extractApiErrorMessage(err, err instanceof Error && err.message ? err.message : SKILL_EVIDENCE_FAILED);
    }
  }
  return { failed, reason };
}
