import apiClient from './client';
import { technicianProfileApi } from './technician-profile.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };

beforeEach(() => jest.resetAllMocks());

describe('technicianProfileApi skill verification', () => {
  it('reads the service verification with the refusal reason, or null before any certificate', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { id: 'v1', status: 'rejected', rejectionReason: 'Ảnh mờ', documents: [{ id: 'd1', fileName: 'a.jpg' }] } } });
    await expect(technicianProfileApi.getSkillVerification('s1')).resolves.toEqual({
      id: 'v1', status: 'rejected', rejectionReason: 'Ảnh mờ',
      documents: [{ id: 'd1', fileName: 'a.jpg', evidenceType: null, issuer: null, referenceNumber: null, issuedAt: null, expiresAt: null, claimedYears: null, reviewStatus: null, reviewNote: null }],
    });
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

  it('reads the evidence details and drops an unknown type or review status instead of guessing', async () => {
    api.get.mockResolvedValue({ data: { data: { id: 'v1', status: 'pending', documents: [
      { id: 'd1', fileName: 'a.jpg', evidenceType: 'electrical_safety_card', issuer: 'Sở Công Thương', referenceNumber: 'AT-01', issuedAt: '2024-05-01', expiresAt: '2027-05-01', claimedYears: 5, reviewStatus: 'need_more', reviewNote: 'Chụp rõ hơn' },
      { id: 'd2', fileName: 'b.jpg', evidenceType: 'made_up', reviewStatus: 'APPROVED_FOREVER', claimedYears: 'abc' },
    ] } } });
    const { documents } = (await technicianProfileApi.getSkillVerification('s1'))!;
    expect(documents[0]).toMatchObject({ evidenceType: 'electrical_safety_card', issuer: 'Sở Công Thương', issuedAt: '2024-05-01', claimedYears: 5, reviewStatus: 'need_more', reviewNote: 'Chụp rõ hơn' });
    expect(documents[1]).toMatchObject({ evidenceType: null, reviewStatus: null, claimedYears: null });
  });

  it('sends the evidence details together with the uploaded file', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { id: 'v1', status: 'pending' } } });
    const doc = { storageObjectPath: 'skills/a.jpg', fileName: 'a.jpg', fileSize: 10, mimeType: 'image/jpeg', evidenceType: 'vocational_diploma' as const, issuer: 'Trường nghề', issuedAt: '2021-06-15' };
    await technicianProfileApi.attachSkillEvidence('s1', doc);
    expect(api.post).toHaveBeenLastCalledWith('/technicians/me/services/s1/verification/documents', doc);
  });

  it('asks for a category-wide upload slot and attaches the paper to several categories', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { storageObjectPath: 'kyc/u/a.jpg', uploadUrl: 'https://storage.test/up' } } });
    await expect(technicianProfileApi.requestCategoryEvidenceUploadUrl('image/png')).resolves.toEqual({ storageObjectPath: 'kyc/u/a.jpg', uploadUrl: 'https://storage.test/up' });
    expect(api.post).toHaveBeenLastCalledWith('/technicians/me/skill-evidence/upload-url', { mimeType: 'image/png' });
    api.post.mockResolvedValueOnce({ data: { data: { attachedSkills: 3, serviceIds: ['a', 'b', 'c'] } } });
    const doc = { storageObjectPath: 'kyc/u/a.jpg', fileName: 'a.jpg', fileSize: 10, mimeType: 'image/jpeg', evidenceType: 'vocational_diploma' as const };
    await expect(technicianProfileApi.attachCategoryEvidence(['cat-ac', 'cat-fr'], doc)).resolves.toEqual({ attachedSkills: 3 });
    expect(api.post).toHaveBeenLastCalledWith('/technicians/me/skill-evidence', { ...doc, categoryIds: ['cat-ac', 'cat-fr'] });
  });

  it('refuses a category slot answer without a path or URL, and reads a missing count as zero', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { uploadUrl: '' } } });
    await expect(technicianProfileApi.requestCategoryEvidenceUploadUrl('image/png')).rejects.toThrow('chưa cấp chỗ tải');
    api.post.mockResolvedValueOnce({ data: { data: {} } });
    await expect(technicianProfileApi.attachCategoryEvidence(['c'], { storageObjectPath: 'p', fileName: 'a.jpg', fileSize: 1, mimeType: 'image/jpeg' })).resolves.toEqual({ attachedSkills: 0 });
  });

  it('refuses a slot answer without a path or URL', async () => {
    api.post.mockResolvedValue({ data: { data: { storageObjectPath: '' } } });
    await expect(technicianProfileApi.requestSkillEvidenceUploadUrl('s1', 'image/png')).rejects.toThrow('chưa cấp chỗ tải');
  });
});
