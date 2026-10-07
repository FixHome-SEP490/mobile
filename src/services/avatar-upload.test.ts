import { UserRole, type UserInfo } from '../types';
import {
  AvatarUploadError,
  avatarErrorMessage,
  updateMyAvatar,
  withPersistedAvatar,
  type AvatarSessionStore,
} from './avatar-upload';

const TECHNICIAN: UserInfo = {
  id: 'technician-1',
  email: 'technician@example.test',
  fullName: 'Technician One',
  phoneNumber: '0900000001',
  avatarUrl: 'https://cdn.example/old.jpg',
  role: UserRole.TECHNICIAN,
};

const HOSTED = 'https://cdn.example/new-avatar.jpg';
const PICKED = {
  uri: 'file:///private/app/picked.jpg',
  fileName: 'picked.jpg',
  mimeType: 'image/jpeg',
};

function sessionStore(user: UserInfo | null = TECHNICIAN, token: string | null = 'access-token') {
  const state = { token, user, setAuth: jest.fn() };
  const store: AvatarSessionStore = { getState: () => state };
  return { store, setAuth: state.setAuth };
}

describe('technician avatar: updateMyAvatar', () => {
  it('uploads the picked file, saves only the hosted URL, then refreshes the session user', async () => {
    const uploadImage = jest.fn().mockResolvedValue({ url: HOSTED });
    const updateProfile = jest.fn().mockResolvedValue({ ...TECHNICIAN, avatarUrl: HOSTED });
    const { store, setAuth } = sessionStore();

    const url = await updateMyAvatar(PICKED, { uploadImage, updateProfile }, store);

    expect(url).toBe(HOSTED);
    expect(uploadImage).toHaveBeenCalledWith({
      uri: 'file:///private/app/picked.jpg',
      name: 'picked.jpg',
      type: 'image/jpeg',
    });
    expect(updateProfile).toHaveBeenCalledWith({ avatarUrl: HOSTED });
    expect(JSON.stringify(updateProfile.mock.calls)).not.toContain('file://');
    expect(uploadImage.mock.invocationCallOrder[0]).toBeLessThan(
      updateProfile.mock.invocationCallOrder[0],
    );
    expect(setAuth).toHaveBeenCalledWith('access-token', { ...TECHNICIAN, avatarUrl: HOSTED });
  });

  it('leaves the profile and the session untouched when the upload fails', async () => {
    const uploadImage = jest.fn().mockRejectedValue(new Error('network'));
    const updateProfile = jest.fn();
    const { store, setAuth } = sessionStore();

    await expect(updateMyAvatar(PICKED, { uploadImage, updateProfile }, store)).rejects.toThrow('network');

    expect(updateProfile).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
  });

  it('does not update the session when the server refuses the profile change', async () => {
    const refusal = {
      response: {
        status: 422,
        data: { error: { code: 'VALIDATION_FAILED', message: 'Ảnh đại diện phải là đường dẫn http(s).' } },
      },
    };
    const uploadImage = jest.fn().mockResolvedValue({ url: HOSTED });
    const updateProfile = jest.fn().mockRejectedValue(refusal);
    const { store, setAuth } = sessionStore();

    await expect(updateMyAvatar(PICKED, { uploadImage, updateProfile }, store)).rejects.toBe(refusal);

    expect(setAuth).not.toHaveBeenCalled();
    expect(avatarErrorMessage(refusal)).toBe('Ảnh đại diện phải là đường dẫn http(s).');
  });

  it('rejects an upload answer that is not a hosted URL before touching the profile', async () => {
    const uploadImage = jest.fn().mockResolvedValue({ url: 'file:///cache/picked.jpg' });
    const updateProfile = jest.fn();
    const { store, setAuth } = sessionStore();

    await expect(updateMyAvatar(PICKED, { uploadImage, updateProfile }, store)).rejects.toBeInstanceOf(
      AvatarUploadError,
    );
    expect(updateProfile).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
  });

  it('does not write another account when the session changed during the upload', async () => {
    const uploadImage = jest.fn().mockResolvedValue({ url: HOSTED });
    const updateProfile = jest.fn().mockResolvedValue({ ...TECHNICIAN, avatarUrl: HOSTED });
    const { store, setAuth } = sessionStore({ ...TECHNICIAN, id: 'someone-else' });

    await updateMyAvatar(PICKED, { uploadImage, updateProfile }, store);

    expect(setAuth).not.toHaveBeenCalled();
  });

  it('skips the session update when signed out, but still reports the saved URL', async () => {
    const uploadImage = jest.fn().mockResolvedValue({ url: HOSTED });
    const updateProfile = jest.fn().mockResolvedValue({ ...TECHNICIAN, avatarUrl: HOSTED });
    const { store, setAuth } = sessionStore(null, null);

    await expect(updateMyAvatar(PICKED, { uploadImage, updateProfile }, store)).resolves.toBe(HOSTED);
    expect(setAuth).not.toHaveBeenCalled();
  });
});

describe('avatar helpers', () => {
  it('keeps app-made Vietnamese messages and falls back for unknown errors', () => {
    expect(avatarErrorMessage(new AvatarUploadError('Ảnh đại diện phải là JPEG, PNG hoặc WebP.'))).toBe(
      'Ảnh đại diện phải là JPEG, PNG hoặc WebP.',
    );
    expect(avatarErrorMessage(new Error('Network Error'))).toBe(
      'Không thể tải ảnh lên. Vui lòng thử lại.',
    );
  });

  it('merges the server profile into the session user and keeps the saved avatar', () => {
    expect(
      withPersistedAvatar(TECHNICIAN, {
        user: { ...TECHNICIAN, fullName: 'Technician Renamed', avatarUrl: HOSTED },
        avatarUrl: HOSTED,
      }),
    ).toEqual({ ...TECHNICIAN, fullName: 'Technician Renamed', avatarUrl: HOSTED });
  });
});
