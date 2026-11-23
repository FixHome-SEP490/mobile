import { technicianProfileApi } from '../../api/technician-profile.api';
import { technicianVerificationApi } from '../../api/technician-verification.api';
import { sendSkillEvidence, skillEvidenceMime, skillEvidenceProblem, SKILL_EVIDENCE_MAX_BYTES } from './skill-evidence';

jest.mock('../../api/technician-profile.api', () => ({
  technicianProfileApi: { requestSkillEvidenceUploadUrl: jest.fn(), attachSkillEvidence: jest.fn() },
}));
jest.mock('../../api/technician-verification.api', () => ({ technicianVerificationApi: { uploadToSignedUrl: jest.fn() } }));

const profile = technicianProfileApi as unknown as { requestSkillEvidenceUploadUrl: jest.Mock; attachSkillEvidence: jest.Mock };
const verification = technicianVerificationApi as unknown as { uploadToSignedUrl: jest.Mock };
const photo = { uri: 'file:///cert.jpg', mimeType: 'image/jpeg', fileName: 'chung-chi-dien-lanh.jpg', fileSize: 120000 };

beforeEach(() => jest.resetAllMocks());

describe('skill evidence file rules', () => {
  it('takes the picker type when Backend accepts it, else the extension', () => {
    expect(skillEvidenceMime(photo)).toBe('image/jpeg');
    expect(skillEvidenceMime({ uri: 'file:///x.PNG?cache=1', mimeType: 'application/octet-stream' })).toBe('image/png');
    expect(skillEvidenceMime({ uri: 'file:///x.webp' })).toBe('image/webp');
    expect(skillEvidenceMime({ uri: 'file:///x.pdf', mimeType: 'application/pdf' })).toBeNull();
  });
  it('refuses a document and a photo over 10 MB', () => {
    expect(skillEvidenceProblem({ uri: 'file:///x.pdf', mimeType: 'application/pdf' })).toContain('JPG, PNG hoặc WebP');
    expect(skillEvidenceProblem({ ...photo, fileSize: SKILL_EVIDENCE_MAX_BYTES + 1 })).toBe('Ảnh tối đa 10 MB.');
    expect(skillEvidenceProblem(photo)).toBeNull();
  });
});

describe('sendSkillEvidence', () => {
  it('asks for a slot, uploads the bytes, then attaches the file to the service', async () => {
    profile.requestSkillEvidenceUploadUrl.mockResolvedValue({ storageObjectPath: 'skills/s1/a.jpg', uploadUrl: 'https://storage.test/up' });
    verification.uploadToSignedUrl.mockResolvedValue(undefined);
    profile.attachSkillEvidence.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [] });
    await expect(sendSkillEvidence('s1', photo)).resolves.toMatchObject({ status: 'pending' });
    expect(profile.requestSkillEvidenceUploadUrl).toHaveBeenCalledWith('s1', 'image/jpeg');
    expect(verification.uploadToSignedUrl).toHaveBeenCalledWith('https://storage.test/up', 'image/jpeg', { uri: 'file:///cert.jpg' });
    expect(profile.attachSkillEvidence).toHaveBeenCalledWith('s1', { storageObjectPath: 'skills/s1/a.jpg', fileName: 'chung-chi-dien-lanh.jpg', fileSize: 120000, mimeType: 'image/jpeg' });
  });

  it('attaches nothing when the upload fails, and sends nothing for a file Backend would refuse', async () => {
    profile.requestSkillEvidenceUploadUrl.mockResolvedValue({ storageObjectPath: 'p', uploadUrl: 'https://storage.test/up' });
    verification.uploadToSignedUrl.mockRejectedValue(new Error('Tải ảnh lên thất bại (mã lỗi 400).'));
    await expect(sendSkillEvidence('s1', photo)).rejects.toThrow('mã lỗi 400');
    expect(profile.attachSkillEvidence).not.toHaveBeenCalled();
    await expect(sendSkillEvidence('s1', { uri: 'file:///x.pdf', mimeType: 'application/pdf' })).rejects.toThrow('JPG, PNG hoặc WebP');
    expect(profile.requestSkillEvidenceUploadUrl).toHaveBeenCalledTimes(1);
  });
});
