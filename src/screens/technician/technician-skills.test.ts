import type { CategoryItem, ServiceItem } from '../../api/services.api';
import type { TechnicianServiceOffering } from '../../api/technician-profile.api';
import { buildSkillDrafts, countSkills, evidenceCategories, groupSkills, groupSummary, isSkillDirty, skillStateOf } from './technician-skills';

const service = (id: string, name: string, categoryId: string): ServiceItem =>
  ({ id, name, categoryId, pricingMode: 'inspection_required', isActive: true }) as ServiceItem;
const category = (id: string, name: string): CategoryItem => ({ id, name, code: id, isActive: true, sortOrder: 0 });
const offering = (serviceId: string, verificationStatus: TechnicianServiceOffering['verificationStatus'], isActive = true): TechnicianServiceOffering =>
  ({ id: `o-${serviceId}`, serviceId, listedLaborPrice: 100000, typicalWarrantyDays: 7, level: 'INTERMEDIATE', isActive, verificationStatus }) as TechnicianServiceOffering;

const services = [service('s1', 'Vệ sinh điều hòa', 'ac'), service('s2', 'Nạp gas điều hòa', 'ac'), service('s3', 'Sửa tủ lạnh', 'fr'), service('s4', 'Thay ổ cắm', 'el')];
const categories = [category('ac', 'Điều hòa'), category('fr', 'Tủ lạnh'), category('el', 'Điện')];
const offerings = { s1: offering('s1', 'verified'), s2: offering('s2', 'rejected'), s3: offering('s3', 'pending', false) };

describe('technician skills logic', () => {
  it('reads a switched-off, never approved skill as not taken, but keeps an approved one', () => {
    expect(skillStateOf(undefined)).toBe('none');
    expect(skillStateOf(offering('x', 'pending', false))).toBe('none');
    expect(skillStateOf(offering('x', 'verified', false))).toBe('verified');
    expect(skillStateOf(offering('x', 'rejected'))).toBe('rejected');
  });

  it('counts by state and describes a group without opening it', () => {
    expect(countSkills(services, offerings)).toEqual({ all: 4, verified: 1, pending: 0, rejected: 1, none: 2 });
    const [ac] = groupSkills(services, categories, offerings, 'all', '');
    expect(groupSummary(ac, offerings)).toBe('1 đã duyệt · 1 bị từ chối · 2 dịch vụ');
  });

  it('groups by category and drops the groups the filter or the search empties', () => {
    expect(groupSkills(services, categories, offerings, 'all', '').map((g) => g.name)).toEqual(['Điều hòa', 'Tủ lạnh', 'Điện']);
    expect(groupSkills(services, categories, offerings, 'rejected', '').map((g) => g.services.map((s) => s.id))).toEqual([['s2']]);
    expect(groupSkills(services, categories, offerings, 'all', 'tu lanh').map((g) => g.id)).toEqual(['fr']);
    expect(groupSkills(services, categories, offerings, 'verified', 'tủ lạnh')).toEqual([]);
  });

  it('only offers a paper the categories that still have a skill waiting for approval', () => {
    expect(evidenceCategories(services, categories, offerings)).toEqual([{ id: 'ac', name: 'Điều hòa' }]);
    expect(evidenceCategories(services, categories, { s1: offering('s1', 'verified') })).toEqual([]);
  });

  it('shows the save button only when the draft differs from the server', () => {
    const drafts = buildSkillDrafts(services, offerings, 30);
    expect(drafts.s4).toEqual({ enabled: false, listedLaborPrice: '', typicalWarrantyDays: '30', level: 'INTERMEDIATE' });
    expect(isSkillDirty(drafts.s1, offerings.s1, false)).toBe(false);
    expect(isSkillDirty({ ...drafts.s1, listedLaborPrice: '150000' }, offerings.s1, false)).toBe(true);
    expect(isSkillDirty({ ...drafts.s1, listedLaborPrice: '150000' }, offerings.s1, true)).toBe(false);
    expect(isSkillDirty({ ...drafts.s4, enabled: true }, undefined, false)).toBe(true);
  });
});
