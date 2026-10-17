import type { CategoryItem, ServiceItem } from '../../api/services.api';

export interface CustomerServiceGroup {
  category: CategoryItem;
  services: ServiceItem[];
}

function normalizeServiceAlias(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
    .replace(/\btivi\b/g, 'tv')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Resolve a Home shortcut only against services returned by the live catalog. */
export function resolvePopularServiceServices(
  services: ServiceItem[],
  serviceCode?: string,
  serviceAlias?: string,
): ServiceItem[] {
  const requestedCode = serviceCode?.trim().toLocaleUpperCase('en-US');
  const aliasTokens = serviceAlias ? normalizeServiceAlias(serviceAlias) : [];
  if (!requestedCode && aliasTokens.length === 0) return [];

  const cleaningFamily = requestedCode === 'VE_SINH_DIEU_HOA_1HP'
    ? 'VE_SINH_DIEU_HOA'
    : null;

  return services.filter((service) => {
    const catalogCode = service.code?.trim().toLocaleUpperCase('en-US');
    const codeMatch = Boolean(
      requestedCode
      && catalogCode
      && (catalogCode === requestedCode || (cleaningFamily
        && (catalogCode === cleaningFamily || catalogCode.startsWith(`${cleaningFamily}_`)))),
    );
    const nameTokens = normalizeServiceAlias(service.name);
    const aliasMatch = aliasTokens.length > 0 && aliasTokens.every((token) => nameTokens.includes(token));
    return codeMatch || aliasMatch;
  });
}

/** Build discovery groups only from authoritative category/service IDs and sort orders. */
export function groupCustomerServices(
  categories: CategoryItem[],
  services: ServiceItem[],
  categoryCode?: string,
): CustomerServiceGroup[] {
  return categories
    .filter((category) => !categoryCode || category.code === categoryCode)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((category) => ({
      category,
      services: services
        .filter((service) => service.categoryId === category.id)
        .slice()
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)),
    }));
}
