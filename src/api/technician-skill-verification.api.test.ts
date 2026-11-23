import apiClient from './client';
import { technicianProfileApi } from './technician-profile.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

beforeEach(() => jest.resetAllMocks());

describe('technicianProfileApi skill verification', () => {
  it('reads the service verification with the refusal reason, or null before any certificate', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { id: 'v1', status: 'rejected', rejectionReason: 'Ảnh mờ', documents: [{ id: 'd1', fileName: 'a.jpg' }] } } });
    await expect(technicianProfileApi.getSkillVerification('s1')).resolves.toEqual({ id: 'v1', status: 'rejected', rejectionReason: 'Ảnh mờ', documents: [{ id: 'd1', fileName: 'a.jpg' }] });
    expect(api.get).toHaveBeenCalledWith('/technicians/me/services/s1/verification');
    api.get.mockResolvedValueOnce({ data: { data: null } });
    await expect(technicianProfileApi.getSkillVerification('s1')).resolves.toBeNull();
  });

  it('treats an unknown status as pending, never as approved', async () => {
    api.get.mockResolvedValue({ data: { data: { id: 'v1', status: 'APPROVED_FOREVER' } } });
    await expect(technicianProfileApi.getSkillVerification('s1')).resolves.toMatchObject({ status: 'pending', rejectionReason: null, documents: [] });
  });

  it('asks for an upload slot and attaches the uploaded file', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { storageObjectPath: 'skills/a.jpg', uploadUrl: 'https://storage.test/up' } } });
    await expect(technicianProfileApi.requestSkillEvidenceUploadUrl('s1', 'image/jpeg')).resolves.toEqual({ storageObjectPath: 'skills/a.jpg', uploadUrl: 'https://storage.test/up' });
    expect(api.post).toHaveBeenLastCalledWith('/technicians/me/services/s1/verification/documents/upload-url', { mimeType: 'image/jpeg' });
    api.post.mockResolvedValueOnce({ data: { data: { id: 'v1', status: 'pending' } } });
    const doc = { storageObjectPath: 'skills/a.jpg', fileName: 'a.jpg', fileSize: 10, mimeType: 'image/jpeg' };
    await expect(technicianProfileApi.attachSkillEvidence('s1', doc)).resolves.toMatchObject({ status: 'pending' });
    expect(api.post).toHaveBeenLastCalledWith('/technicians/me/services/s1/verification/documents', doc);
  });

  it('refuses a slot answer without a path or URL', async () => {
    api.post.mockResolvedValue({ data: { data: { storageObjectPath: '' } } });
    await expect(technicianProfileApi.requestSkillEvidenceUploadUrl('s1', 'image/png')).rejects.toThrow('chưa cấp chỗ tải');
  });
});
