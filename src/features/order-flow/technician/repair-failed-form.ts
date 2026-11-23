// Rules of the "Không sửa được" form, as on web (FailedRepairDialog + technician-failed-repair.api): note up to 500 characters,
// up to 3 photos, and every part received must say whether it was fitted. Nothing is guessed on the technician's behalf.
export const REPAIR_FAILED_NOTE_MAX = 500;
export const REPAIR_FAILED_PHOTO_MAX = 3;

export type PartOutcome = 'installed' | 'returned';

/** Why the form cannot be sent yet, or null. */
export function repairFailedProblem(input: { parts: { id: string }[]; outcomes: Record<string, PartOutcome | undefined>; photoCount: number }): string | null {
  if (input.photoCount > REPAIR_FAILED_PHOTO_MAX) return `Tối đa ${REPAIR_FAILED_PHOTO_MAX} ảnh.`;
  if (input.parts.some((part) => !input.outcomes[part.id])) return 'Chọn tình trạng của từng linh kiện: đã lắp hay chưa lắp.';
  return null;
}

export const repairFailedBody = (input: {
  reason: string;
  note: string;
  parts: { id: string }[];
  outcomes: Record<string, PartOutcome | undefined>;
  photoEvidenceIds: string[];
}) => ({
  reason: input.reason,
  ...(input.note.trim() ? { note: input.note.trim().slice(0, REPAIR_FAILED_NOTE_MAX) } : {}),
  ...(input.photoEvidenceIds.length ? { photoEvidenceIds: [...input.photoEvidenceIds].sort() } : {}),
  ...(input.parts.length ? { parts: input.parts.map((p) => ({ partRequestId: p.id, outcome: input.outcomes[p.id] as PartOutcome })) } : {}),
});

export const REPAIR_FAILED_UNKNOWN = 'Chưa xác nhận được kết quả. Hãy kiểm tra kết quả trước khi gửi lại.';
export const REPAIR_FAILED_CHANGED = 'Trạng thái hoặc báo cáo của máy đã thay đổi. Đóng và tải lại công việc để kiểm tra.';
export const REPAIR_FAILED_LOCKED = 'Nội dung báo cáo đã khóa. Gửi lại đúng nội dung đã gửi để kiểm tra kết quả.';
