// A technician's certificate for one service (web TechnicianProfilePage handleUploadEvidence): ask for a signed upload
// slot, put the file straight to storage, then attach it to the service's verification. Photos only on the phone.
import { technicianProfileApi, type SkillVerification } from '../../api/technician-profile.api';
import { technicianVerificationApi, type KycMimeType } from '../../api/technician-verification.api';

export const SKILL_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const SKILL_EVIDENCE_SENT = 'Đã gửi chứng chỉ. FixHome sẽ xem xét.';
export const SKILL_EVIDENCE_FAILED = 'Không thể gửi chứng chỉ. Vui lòng thử lại.';
export const SKILL_STATUS_LABEL: Record<'pending' | 'verified' | 'rejected', string> = {
  pending: 'Chờ duyệt chứng chỉ',
  verified: 'Đã duyệt chứng chỉ',
  rejected: 'Chứng chỉ bị từ chối',
};

export interface SkillEvidenceAsset { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null }

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
export async function sendSkillEvidence(serviceId: string, asset: SkillEvidenceAsset): Promise<SkillVerification> {
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
  });
}
