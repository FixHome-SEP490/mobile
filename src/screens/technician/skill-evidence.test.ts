import { technicianProfileApi } from '../../api/technician-profile.api';
import { technicianVerificationApi } from '../../api/technician-verification.api';
import {
  EMPTY_SKILL_EVIDENCE_FORM, SKILL_EVIDENCE_MAX_BYTES, SKILL_EVIDENCE_TYPES, SKILL_EVIDENCE_TYPE_LABEL, isoToViDate, parseViDate, sendSkillEvidence,
  skillEvidenceDetails, skillEvidenceFields, skillEvidenceFormProblem, skillEvidenceMime, skillEvidenceProblem,
  selectedEvidenceCategories, sendCategoryEvidence, sendStagedEvidence, skillEvidenceCategoriesProblem, skillEvidenceFormFromSent, type StagedSkillEvidence,
} from './skill-evidence';

jest.mock('../../api/technician-profile.api', () => ({
  ...jest.requireActual('../../api/technician-profile.api'),
  technicianProfileApi: {
    requestSkillEvidenceUploadUrl: jest.fn(), attachSkillEvidence: jest.fn(),
    requestCategoryEvidenceUploadUrl: jest.fn(), attachCategoryEvidence: jest.fn(),
  },
}));
jest.mock('../../api/technician-verification.api', () => ({ technicianVerificationApi: { uploadToSignedUrl: jest.fn() } }));

const profile = technicianProfileApi as unknown as {
  requestSkillEvidenceUploadUrl: jest.Mock; attachSkillEvidence: jest.Mock;
  requestCategoryEvidenceUploadUrl: jest.Mock; attachCategoryEvidence: jest.Mock;
};
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

describe('skill evidence details', () => {
  const TODAY = '2026-11-23';
  const form = (patch: Partial<typeof EMPTY_SKILL_EVIDENCE_FORM>) => ({ ...EMPTY_SKILL_EVIDENCE_FORM, ...patch });

  it('has a Vietnamese label for every type Backend accepts', () => {
    expect(SKILL_EVIDENCE_TYPES.every((type) => !!SKILL_EVIDENCE_TYPE_LABEL[type])).toBe(true);
    expect(SKILL_EVIDENCE_TYPES).toHaveLength(8);
  });

  it('shows the details that fit the type', () => {
    expect(skillEvidenceFields(null)).toEqual([]);
    expect(skillEvidenceFields('electrical_safety_card')).toEqual(['issuer', 'referenceNumber', 'issuedAt', 'expiresAt']);
    expect(skillEvidenceFields('social_insurance')).toEqual(['issuer', 'issuedAt', 'claimedYears']);
    expect(skillEvidenceFields('work_photos')).toEqual(['claimedYears']);
  });

  it('reads dd/MM/yyyy only for a real calendar date', () => {
    expect(parseViDate('15/06/2021')).toBe('2021-06-15');
    expect(parseViDate('5/6/2021')).toBe('2021-06-05');
    expect(parseViDate('31/02/2021')).toBeNull();
    expect(parseViDate('2021-06-15')).toBeNull();
    expect(isoToViDate('2021-06-15')).toBe('15/06/2021');
  });

  it('needs a type and refuses bad dates, an expiry before the issue date and an expired paper', () => {
    expect(skillEvidenceFormProblem(EMPTY_SKILL_EVIDENCE_FORM, TODAY)).toBe('Chọn loại giấy tờ.');
    const base = { evidenceType: 'vocational_diploma' as const };
    expect(skillEvidenceFormProblem(form(base), TODAY)).toBeNull();
    expect(skillEvidenceFormProblem(form({ ...base, issuedAt: '31/02/2021' }), TODAY)).toContain('Ngày cấp chưa đúng');
    expect(skillEvidenceFormProblem(form({ ...base, issuedAt: '24/11/2026' }), TODAY)).toBe('Ngày cấp không được sau hôm nay.');
    expect(skillEvidenceFormProblem(form({ ...base, issuedAt: '02/05/2024', expiresAt: '01/05/2024' }), TODAY)).toBe('Ngày hết hạn không được trước ngày cấp.');
    expect(skillEvidenceFormProblem(form({ ...base, expiresAt: '22/11/2026' }), TODAY)).toBe('Giấy tờ đã hết hạn.');
    expect(skillEvidenceFormProblem(form({ ...base, expiresAt: '23/11/2026' }), TODAY)).toBeNull();
  });

  it('checks the years only where the type asks for them', () => {
    expect(skillEvidenceFormProblem(form({ evidenceType: 'work_photos', claimedYears: '61' }), TODAY)).toBe('Số năm kinh nghiệm từ 0 đến 60.');
    expect(skillEvidenceFormProblem(form({ evidenceType: 'work_photos', claimedYears: '0' }), TODAY)).toBeNull();
    expect(skillEvidenceFormProblem(form({ evidenceType: 'vocational_diploma', claimedYears: '99' }), TODAY)).toBeNull();
  });

  it('builds only the fields the type shows, trimmed, with ISO dates', () => {
    expect(skillEvidenceDetails(EMPTY_SKILL_EVIDENCE_FORM)).toBeUndefined();
    expect(skillEvidenceDetails(form({
      evidenceType: 'vocational_diploma', issuer: '  Trường nghề ', referenceNumber: '', issuedAt: '15/06/2021', expiresAt: '', claimedYears: '9',
    }))).toEqual({ evidenceType: 'vocational_diploma', issuer: 'Trường nghề', issuedAt: '2021-06-15' });
    expect(skillEvidenceDetails(form({ evidenceType: 'work_photos', issuer: 'bỏ qua', claimedYears: '3' }))).toEqual({ evidenceType: 'work_photos', claimedYears: 3 });
  });

  it('sends the details with the file, and the file alone as before', async () => {
    profile.requestSkillEvidenceUploadUrl.mockResolvedValue({ storageObjectPath: 'skills/s1/a.jpg', uploadUrl: 'https://storage.test/up' });
    verification.uploadToSignedUrl.mockResolvedValue(undefined);
    profile.attachSkillEvidence.mockResolvedValue({ id: 'v1', status: 'pending', rejectionReason: null, documents: [] });
    await sendSkillEvidence('s1', photo, { evidenceType: 'electrical_safety_card', issuedAt: '2024-05-01' });
    expect(profile.attachSkillEvidence).toHaveBeenCalledWith('s1', {
      storageObjectPath: 'skills/s1/a.jpg', fileName: 'chung-chi-dien-lanh.jpg', fileSize: 120000, mimeType: 'image/jpeg',
      evidenceType: 'electrical_safety_card', issuedAt: '2024-05-01',
    });
  });
});

describe('skill evidence by service category (registration step 3)', () => {
  const services = [
    { id: 'ac-1', categoryId: 'cat-ac', categoryName: 'Điều hòa' },
    { id: 'ac-2', categoryId: 'cat-ac', categoryName: 'Điều hòa' },
    { id: 'fr-1', categoryId: 'cat-fr' },
    { id: 'wm-1', categoryId: 'cat-wm', categoryName: 'Máy giặt & máy sấy' },
  ];
  const names = new Map([['cat-fr', 'Tủ lạnh']]);
  const staged = (key: string, categoryIds = ['cat-ac', 'cat-fr']): StagedSkillEvidence => ({ key, asset: photo, details: { evidenceType: 'vocational_diploma' }, categoryIds });

  it('offers only the categories of the selected services, once each, named from the service or the catalog', () => {
    expect(selectedEvidenceCategories(services, ['ac-1', 'ac-2', 'fr-1'], names)).toEqual([
      { id: 'cat-ac', name: 'Điều hòa' }, { id: 'cat-fr', name: 'Tủ lạnh' },
    ]);
    expect(selectedEvidenceCategories(services, [], names)).toEqual([]);
    expect(selectedEvidenceCategories(services, ['fr-1'], new Map())[0].name).toBe('Khác');
  });

  it('asks for a slot, uploads, then attaches the paper to the chosen categories', async () => {
    profile.requestCategoryEvidenceUploadUrl.mockResolvedValue({ storageObjectPath: 'kyc/u/a.jpg', uploadUrl: 'https://storage.test/up' });
    verification.uploadToSignedUrl.mockResolvedValue(undefined);
    profile.attachCategoryEvidence.mockResolvedValue({ attachedSkills: 3 });
    await expect(sendCategoryEvidence(['cat-ac', 'cat-fr'], photo, { evidenceType: 'vocational_diploma', issuer: 'Trường nghề' })).resolves.toBe(3);
    expect(profile.requestCategoryEvidenceUploadUrl).toHaveBeenCalledWith('image/jpeg');
    expect(profile.attachCategoryEvidence).toHaveBeenCalledWith(['cat-ac', 'cat-fr'], {
      storageObjectPath: 'kyc/u/a.jpg', fileName: 'chung-chi-dien-lanh.jpg', fileSize: 120000, mimeType: 'image/jpeg',
      evidenceType: 'vocational_diploma', issuer: 'Trường nghề',
    });
  });

  it('attaches nothing when the upload fails, and sends nothing for a file Backend would refuse', async () => {
    profile.requestCategoryEvidenceUploadUrl.mockResolvedValue({ storageObjectPath: 'p', uploadUrl: 'https://storage.test/up' });
    verification.uploadToSignedUrl.mockRejectedValue(new Error('Tải ảnh lên thất bại (mã lỗi 400).'));
    await expect(sendCategoryEvidence(['cat-ac'], photo, { evidenceType: 'other' })).rejects.toThrow('mã lỗi 400');
    expect(profile.attachCategoryEvidence).not.toHaveBeenCalled();
    await expect(sendCategoryEvidence(['cat-ac'], { uri: 'file:///x.pdf', mimeType: 'application/pdf' }, { evidenceType: 'other' })).rejects.toThrow('JPG, PNG hoặc WebP');
    expect(profile.requestCategoryEvidenceUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('sends every waiting paper to all the chosen categories, one at a time, and hands back only the ones that failed', async () => {
    const order: string[] = [];
    profile.requestCategoryEvidenceUploadUrl.mockImplementation(async () => { order.push('slot'); return { storageObjectPath: `p${order.length}`, uploadUrl: 'https://storage.test/up' }; });
    verification.uploadToSignedUrl.mockResolvedValue(undefined);
    profile.attachCategoryEvidence
      .mockImplementationOnce(async () => { order.push('attach-1'); return { attachedSkills: 1 }; })
      .mockImplementationOnce(async () => { order.push('attach-2'); throw new Error('mạng lỗi'); })
      .mockImplementationOnce(async () => { order.push('attach-3'); return { attachedSkills: 1 }; });
    const waiting = [staged('a'), staged('b'), staged('c')];
    const { failed } = await sendStagedEvidence(waiting, ['cat-ac', 'cat-fr']);
    expect(failed).toEqual([waiting[1]]);
    expect(order).toEqual(['slot', 'attach-1', 'slot', 'attach-2', 'slot', 'attach-3']);
    expect(profile.attachCategoryEvidence).toHaveBeenCalledTimes(3);
    for (const call of profile.attachCategoryEvidence.mock.calls) expect(call[0]).toEqual(['cat-ac', 'cat-fr']);
    await expect(sendStagedEvidence([], ['cat-ac'])).resolves.toEqual({ failed: [], reason: null });
  });

  it('sends each paper only to its own categories, and fails one whose categories were all dropped', async () => {
    profile.requestCategoryEvidenceUploadUrl.mockResolvedValue({ signedUrl: 'https://s/put', storageObjectPath: 'kyc/u/x.jpg' });
    verification.uploadToSignedUrl.mockResolvedValue(undefined);
    profile.attachCategoryEvidence.mockResolvedValue({ attachedSkills: 1 });
    const cold = staged('cold', ['cat-ac', 'cat-fr']);
    const electric = staged('electric', ['cat-el', 'cat-ac']);
    const gone = staged('gone', ['cat-removed']);
    const { failed, reason } = await sendStagedEvidence([cold, electric, gone], ['cat-ac', 'cat-fr', 'cat-el']);
    expect(failed).toEqual([gone]);
    expect(reason).toBe('Chọn ít nhất một nhóm cho giấy tờ này.');
    expect(profile.attachCategoryEvidence.mock.calls.map((call) => call[0])).toEqual([['cat-ac', 'cat-fr'], ['cat-el', 'cat-ac']]);
  });

  it('needs at least one category for a paper', () => {
    expect(skillEvidenceCategoriesProblem([])).toBe('Chọn ít nhất một nhóm cho giấy tờ này.');
    expect(skillEvidenceCategoriesProblem(['cat-ac'])).toBeNull();
  });
});

describe('skillEvidenceFormFromSent', () => {
  it('fills the form from a paper already sent, so saving it unchanged sends the same details', () => {
    const sent = { documentId: 'd', serviceId: 's', fileName: 'a.jpg', mimeType: 'image/jpeg', evidenceType: 'vocational_diploma' as const, issuer: 'Trường nghề', referenceNumber: '123', issuedAt: '2015-12-22', expiresAt: null, claimedYears: null, categories: [] };
    const form = skillEvidenceFormFromSent(sent);
    expect(form).toMatchObject({ evidenceType: 'vocational_diploma', issuer: 'Trường nghề', referenceNumber: '123', issuedAt: '22/12/2015', expiresAt: '', claimedYears: '' });
    expect(skillEvidenceDetails(form)).toMatchObject({ evidenceType: 'vocational_diploma', issuer: 'Trường nghề', referenceNumber: '123', issuedAt: '2015-12-22' });
  });
});
