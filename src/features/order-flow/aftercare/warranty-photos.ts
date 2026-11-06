// Photos attached to a warranty step (PO 05/11/2026): the same /media/upload route and limits as the web.
// The picker is a convenience; the result is a list of URLs the controller is told about, so the
// evidenceRefs contract still only accepts URLs it knows.
import { mediaApi } from '../../../api/media.api';
import { jpegForUpload } from '../../../services/image-for-ai';
import { attachmentProblem, pickChatAttachment, type PickSource } from '../../../screens/chat/chat-attachment';

export const WARRANTY_PHOTO_MAX = 5;

/** One photo from the library or the camera, shrunk to JPEG and uploaded. Throws an Error whose text is for the person. */
export async function pickAndUploadWarrantyPhoto(source: Extract<PickSource, 'library' | 'camera-photo'>): Promise<string | null> {
  const { picked, problem } = await pickChatAttachment(source);
  if (problem) throw new Error(problem);
  if (!picked) return null;
  if (picked.kind !== 'image') throw new Error('Chỉ đính kèm được ảnh (JPG, PNG, WebP).');
  const refusal = attachmentProblem(picked);
  if (refusal) throw new Error(refusal);
  const jpeg = await jpegForUpload(picked.uri);
  const file = jpeg
    ? { uri: jpeg, name: `${picked.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, type: 'image/jpeg' as const }
    : /^image\/(jpeg|png|webp)$/i.test(picked.type) ? { uri: picked.uri, name: picked.name, type: picked.type as 'image/jpeg' | 'image/png' | 'image/webp' } : null;
  if (!file) throw new Error('Ảnh này không đọc được, vui lòng chọn ảnh khác.');
  return (await mediaApi.uploadPublicImage(file)).url;
}
