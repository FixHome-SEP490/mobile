import type { CategoryItem, ServiceItem } from '../../api/services.api';

export interface CustomerServiceGroup {
  category: CategoryItem;
  services: ServiceItem[];
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
