// Pure logic of the technician skills page: what state a service is in, the drafts the technician edits, and how the
// catalog is grouped, filtered and counted.
import type { CategoryItem, ServiceItem } from '../../api/services.api';
import type { TechnicianServiceOffering } from '../../api/technician-profile.api';

/** `none`: not taken (never added, or switched off before FixHome approved it). */
export type SkillState = 'verified' | 'pending' | 'rejected' | 'none';
export type SkillFilter = 'all' | SkillState;

export const SKILL_FILTERS: { key: SkillFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'verified', label: 'Đã duyệt' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'rejected', label: 'Bị từ chối' },
  { key: 'none', label: 'Chưa đăng ký' },
];

export type SkillDraft = { enabled: boolean; listedLaborPrice: string; typicalWarrantyDays: string; level: string };
export type SkillGroup = { id: string; name: string; services: ServiceItem[] };
export type SkillCounts = Record<SkillFilter, number>;

export function skillStateOf(offering?: TechnicianServiceOffering): SkillState {
  if (!offering) return 'none';
  if (!offering.isActive && offering.verificationStatus !== 'verified') return 'none';
  return offering.verificationStatus;
}

export const isFixedPriceService = (service: ServiceItem) => String(service.pricingMode).toLowerCase() === 'fixed_price';

export function buildSkillDrafts(
  services: ServiceItem[],
  offerings: Record<string, TechnicianServiceOffering>,
  defaultWarrantyDays: number,
): Record<string, SkillDraft> {
  const drafts: Record<string, SkillDraft> = {};
  for (const service of services) {
    const offering = offerings[service.id];
    drafts[service.id] = {
      enabled: offering?.isActive ?? false,
      listedLaborPrice: offering?.listedLaborPrice != null ? String(offering.listedLaborPrice) : '',
      typicalWarrantyDays: offering?.typicalWarrantyDays != null ? String(offering.typicalWarrantyDays) : String(defaultWarrantyDays),
      level: offering?.level ?? 'INTERMEDIATE',
    };
  }
  return drafts;
}

/** The save button shows only when the draft differs from what the server holds. */
export function isSkillDirty(draft: SkillDraft, offering: TechnicianServiceOffering | undefined, isFixedPrice: boolean): boolean {
  if (!offering) return draft.enabled;
  return draft.enabled !== offering.isActive
    || draft.typicalWarrantyDays !== (offering.typicalWarrantyDays != null ? String(offering.typicalWarrantyDays) : draft.typicalWarrantyDays)
    || (!isFixedPrice && draft.listedLaborPrice !== (offering.listedLaborPrice != null ? String(offering.listedLaborPrice) : ''));
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().trim();

const categoryNameOf = (service: ServiceItem, categories: CategoryItem[]) =>
  service.categoryName ?? categories.find((c) => c.id === service.categoryId)?.name ?? 'Khác';

/** Services grouped by category (catalog order), after the state filter and the name search; empty groups are dropped. */
export function groupSkills(
  services: ServiceItem[],
  categories: CategoryItem[],
  offerings: Record<string, TechnicianServiceOffering>,
  filter: SkillFilter,
  query: string,
): SkillGroup[] {
  const needle = fold(query);
  const groups = new Map<string, SkillGroup>();
  for (const category of categories) groups.set(category.id, { id: category.id, name: category.name, services: [] });
  for (const service of services) {
    if (filter !== 'all' && skillStateOf(offerings[service.id]) !== filter) continue;
    if (needle && !fold(service.name).includes(needle)) continue;
    const group = groups.get(service.categoryId) ?? { id: service.categoryId, name: categoryNameOf(service, categories), services: [] };
    group.services.push(service);
    groups.set(group.id, group);
  }
  return [...groups.values()].filter((g) => g.services.length > 0);
}

export function countSkills(services: ServiceItem[], offerings: Record<string, TechnicianServiceOffering>): SkillCounts {
  const counts: SkillCounts = { all: services.length, verified: 0, pending: 0, rejected: 0, none: 0 };
  for (const service of services) counts[skillStateOf(offerings[service.id])] += 1;
  return counts;
}

/** "3 đã duyệt · 1 chờ duyệt": what is in a group, without opening it. */
export function groupSummary(group: SkillGroup, offerings: Record<string, TechnicianServiceOffering>): string {
  const counts = countSkills(group.services, offerings);
  const parts = [
    counts.verified && `${counts.verified} đã duyệt`,
    counts.pending && `${counts.pending} chờ duyệt`,
    counts.rejected && `${counts.rejected} bị từ chối`,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' · ')} · ${group.services.length} dịch vụ` : `${group.services.length} dịch vụ`;
}

/** The categories a new paper may cover: only the ones with a service FixHome has not approved yet (the server refuses the rest). */
export function evidenceCategories(services: ServiceItem[], categories: CategoryItem[], offerings: Record<string, TechnicianServiceOffering>) {
  const found = new Map<string, string>();
  for (const service of services) {
    if (found.has(service.categoryId)) continue;
    const state = skillStateOf(offerings[service.id]);
    if (state === 'pending' || state === 'rejected') found.set(service.categoryId, categoryNameOf(service, categories));
  }
  return Array.from(found, ([id, name]) => ({ id, name }));
}
