// Picks photos for an extra device (Máy 2-3); Máy 1 keeps the booking form's own picker and uploads.
import * as ImagePicker from 'expo-image-picker';
import { VISIT_PHOTOS_PER_DEVICE, photoKey, type VisitPhotoDraft } from './customer-visit-draft';

const photoType = (mime?: string | null, name?: string | null): VisitPhotoDraft['type'] | null => {
  const m = mime?.trim().toLowerCase();
  if (m === 'image/jpg' || m === 'image/jpeg') return 'image/jpeg';
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  if (m) return null;
  const ext = name?.split('.').pop()?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : null;
};

/** Photos after the pick, plus the first problem found. `usedKeys` (photoKey of the photos on the other devices): one photo belongs to one device only. */
export async function pickVisitPhotos(existing: VisitPhotoDraft[], usedKeys: string[]): Promise<{ photos: VisitPhotoDraft[]; error: string }> {
  if (existing.length >= VISIT_PHOTOS_PER_DEVICE) return { photos: existing, error: '' };
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { photos: existing, error: 'Cho phép truy cập thư viện ảnh để đính kèm ảnh sự cố.' };
    const remaining = VISIT_PHOTOS_PER_DEVICE - existing.length;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: remaining > 1, selectionLimit: remaining, quality: 1 });
    if (result.canceled) return { photos: existing, error: '' };
    const used = new Set(usedKeys);
    const photos = [...existing];
    let error = '';
    for (const asset of result.assets) {
      const type = photoType(asset.mimeType, asset.fileName);
      const picked = { uri: asset.uri, name: asset.fileName?.trim() || '', assetId: asset.assetId ?? undefined, sizeBytes: asset.fileSize ?? undefined };
      if (!asset.uri || photos.length >= VISIT_PHOTOS_PER_DEVICE || photos.some((p) => photoKey(p) === photoKey(picked))) continue;
      if (used.has(photoKey(picked))) { error ||= 'Ảnh của mỗi thiết bị phải riêng biệt. Ảnh này đã dùng cho máy khác.'; continue; }
      if (!type) { error ||= 'Ảnh phải có định dạng JPEG, PNG hoặc WebP.'; continue; }
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) { error ||= 'Mỗi ảnh không được vượt quá 10 MiB.'; continue; }
      photos.push({ uri: asset.uri, name: asset.fileName?.trim() || `visit-photo.${type.slice(6)}`, type, assetId: picked.assetId, sizeBytes: picked.sizeBytes });
    }
    return { photos, error };
  } catch { return { photos: existing, error: 'Không thể mở thư viện ảnh. Hãy thử lại.' }; }
}
