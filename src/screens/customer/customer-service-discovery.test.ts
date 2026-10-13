import type { CategoryItem, ServiceItem } from '../../api/services.api';
import { groupCustomerServices } from './customer-service-discovery';

const categories: CategoryItem[] = [
  { id: 'c-13', name: 'Điện lạnh', code: 'DIEN_LANH', isActive: true, sortOrder: 1 },
  { id: 'c-14', name: 'Điện nước', code: 'DIEN_NUOC', isActive: true, sortOrder: 2 },
  { id: 'c-4', name: 'Bếp và gia dụng', code: 'BEP_GIA_DUNG', isActive: true, sortOrder: 3 },
  { id: 'c-2', name: 'Khóa cửa', code: 'KHOA_CUA', isActive: true, sortOrder: 4 },
  { id: 'c-1', name: 'Khác', code: 'KHAC', isActive: true, sortOrder: 5 },
];

const service = (id: number, categoryId: string, sortOrder: number): ServiceItem => ({
  id: `service-${id}`,
  code: `SERVICE_${id}`,
  name: `Dịch vụ ${id}`,
  categoryId,
  categoryName: '',
  pricingMode: 'inspection_required',
  isActive: true,
  sortOrder,
});

describe('groupCustomerServices', () => {
  it('preserves backend category order and every service under its real category', () => {
    const services = [
      ...Array.from({ length: 13 }, (_, index) => service(index, 'c-13', 13 - index)),
      ...Array.from({ length: 14 }, (_, index) => service(index + 13, 'c-14', index)),
      ...Array.from({ length: 4 }, (_, index) => service(index + 27, 'c-4', index)),
      service(31, 'c-2', 0),
      service(32, 'c-2', 1),
      service(33, 'c-1', 0),
    ];

    const groups = groupCustomerServices(categories, services);

    expect(groups.map((group) => [group.category.code, group.services.length])).toEqual([
      ['DIEN_LANH', 13],
      ['DIEN_NUOC', 14],
      ['BEP_GIA_DUNG', 4],
      ['KHOA_CUA', 2],
      ['KHAC', 1],
    ]);
    expect(groups.flatMap((group) => group.services)).toHaveLength(34);
    expect(groups[0].services[0].id).toBe('service-12');
    expect(groups[0].services[12].id).toBe('service-0');
  });

  it('filters to an exact deep-linked category code and retains empty real categories', () => {
    const groups = groupCustomerServices(categories, [service(1, 'c-14', 0)], 'DIEN_NUOC');

    expect(groups).toHaveLength(1);
    expect(groups[0].category.code).toBe('DIEN_NUOC');
    expect(groups[0].services.map((item) => item.id)).toEqual(['service-1']);
  });

  it('does not invent categories for services without a matching backend category', () => {
    const groups = groupCustomerServices(categories, [service(1, 'unknown-category', 0)]);

    expect(groups).toHaveLength(5);
    expect(groups.every((group) => group.services.length === 0)).toBe(true);
  });
});
