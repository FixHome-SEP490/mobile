import { UserRole, type UserInfo } from '../../types';
import {
  normalizeCustomerAvatarAsset,
  persistCustomerAvatar,
} from './customer-avatar-upload';

const CURRENT_PROFILE: UserInfo = {
  id: 'customer-1',
  email: 'customer@example.test',
  fullName: 'Customer One',
  phoneNumber: '0900000000',
  avatarUrl: 'https://cdn.example/old.jpg',
  role: UserRole.CUSTOMER,
};

describe('customer avatar upload', () => {
  it('normalizes supported picker metadata and creates a fallback filename', () => {
    expect(normalizeCustomerAvatarAsset({
      uri: ' file:///picked.png ',
      fileName: null,
      mimeType: 'image/png',
    })).toEqual({
      uri: 'file:///picked.png',
      name: 'avatar.png',
      type: 'image/png',
    });

    expect(normalizeCustomerAvatarAsset({
      uri: 'file:///picked.jpg',
      fileName: 'photo.JPG',
      mimeType: 'image/jpg',
    })).toEqual({
      uri: 'file:///picked.jpg',
      name: 'photo.JPG',
      type: 'image/jpeg',
    });
  });

  it('rejects unsupported or missing image MIME before any network write', async () => {
    const uploadImage = jest.fn();
    const updateProfile = jest.fn();

    await expect(persistCustomerAvatar({
      uri: 'file:///picked.heic',
      fileName: 'picked.heic',
      mimeType: 'image/heic',
    }, { uploadImage, updateProfile })).rejects.toThrow(/JPEG, PNG hoặc WebP/);

    expect(uploadImage).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('uploads first and persists only the returned hosted URL, never the local picker URI', async () => {
    const uploadImage = jest.fn().mockResolvedValue({
      url: 'https://cdn.example/new-avatar.jpg',
    });
    const updateProfile = jest.fn().mockResolvedValue({
      ...CURRENT_PROFILE,
      avatarUrl: 'https://cdn.example/new-avatar.jpg',
    });

    const result = await persistCustomerAvatar({
      uri: 'file:///private/app/avatar.jpg',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    }, { uploadImage, updateProfile });

    expect(uploadImage).toHaveBeenCalledWith({
      uri: 'file:///private/app/avatar.jpg',
      name: 'avatar.jpg',
      type: 'image/jpeg',
    });
    expect(updateProfile).toHaveBeenCalledWith({
      avatarUrl: 'https://cdn.example/new-avatar.jpg',
    });
    expect(JSON.stringify(updateProfile.mock.calls)).not.toContain('file:///private/app/avatar.jpg');
    expect(result).toEqual({
      user: {
        ...CURRENT_PROFILE,
        avatarUrl: 'https://cdn.example/new-avatar.jpg',
      },
      avatarUrl: 'https://cdn.example/new-avatar.jpg',
    });
  });

  it('does not write profile data when media upload fails', async () => {
    const uploadImage = jest.fn().mockRejectedValue(new Error('upload failed'));
    const updateProfile = jest.fn();

    await expect(persistCustomerAvatar({
      uri: 'file:///avatar.jpg',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    }, { uploadImage, updateProfile })).rejects.toThrow('upload failed');

    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('fails when profile persistence does not confirm a hosted avatar URL', async () => {
    const uploadImage = jest.fn().mockResolvedValue({
      url: 'https://cdn.example/new-avatar.jpg',
    });
    const updateProfile = jest.fn().mockResolvedValue({
      ...CURRENT_PROFILE,
      avatarUrl: undefined,
    });

    await expect(persistCustomerAvatar({
      uri: 'file:///avatar.jpg',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    }, { uploadImage, updateProfile })).rejects.toThrow(/hồ sơ.*không hợp lệ/i);
  });
});
