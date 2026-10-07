// Luồng ảnh đại diện nay dùng chung với kỹ thuật viên ở
// `src/services/avatar-upload.ts`; giữ tên cũ để màn khách hàng không đổi.
export {
  normalizeAvatarAsset as normalizeCustomerAvatarAsset,
  persistAvatar as persistCustomerAvatar,
  type AvatarAsset as CustomerAvatarAsset,
  type AvatarUploadDeps as CustomerAvatarDeps,
} from '../../services/avatar-upload';
