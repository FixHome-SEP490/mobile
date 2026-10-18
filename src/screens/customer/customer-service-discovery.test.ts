import type { CategoryItem, ServiceItem } from '../../api/services.api';
import { groupCustomerServices, resolvePopularServiceServices } from './customer-service-discovery';

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

describe('resolvePopularServiceServices', () => {
  it('returns every live air-conditioner cleaning variant from the catalog', () => {
    const services = [
      { ...service(1, 'c-13', 1), code: 'VE_SINH_DIEU_HOA_1HP', name: 'Vệ sinh máy lạnh 1HP' },
      { ...service(2, 'c-13', 2), code: 'VE_SINH_DIEU_HOA_2HP', name: 'Vệ sinh máy lạnh 2HP' },
      { ...service(3, 'c-13', 3), code: 'VE_SINH_DIEU_HOA_AM_TRAN', name: 'Vệ sinh điều hòa âm trần' },
      { ...service(4, 'c-13', 4), code: 'SUA_DIEU_HOA', name: 'Sửa máy lạnh' },
      { ...service(5, 'c-13', 5), code: 'VE_SINH_DIEU_HOA', name: 'Vệ sinh, nạp gas điều hòa' },
    ];

    expect(resolvePopularServiceServices(services, 'VE_SINH_DIEU_HOA_1HP', 'Vệ sinh máy lạnh')
      .map((row) => row.code)).toEqual([
      'VE_SINH_DIEU_HOA_1HP',
      'VE_SINH_DIEU_HOA_2HP',
      'VE_SINH_DIEU_HOA_AM_TRAN',
      'VE_SINH_DIEU_HOA',
    ]);
  });

  it.each([
    ['LAP_TV_GIA_TREO', 'Lắp đặt tivi treo tường', 'Lắp TV treo tường'],
    ['SUA_RO_RI_NUOC', 'Khắc phục rò rỉ nước', 'Sửa rò rỉ nước'],
  ])('matches the live %s service code and normalized Home alias', (code, liveName, alias) => {
    const rows = [
      { ...service(1, 'c-14', 1), code, name: liveName },
      { ...service(2, 'c-14', 2), code: 'UNRELATED', name: 'Dịch vụ khác' },
    ];

    expect(resolvePopularServiceServices(rows, code, alias).map((row) => row.id)).toEqual(['service-1']);
  });

  it('uses a normalized local alias when a live row has no service code', () => {
    const row = { ...service(1, 'c-14', 1), code: undefined, name: 'Lắp đặt tivi treo tường' };
    expect(resolvePopularServiceServices([row], 'LAP_TV_GIA_TREO', 'Lắp TV treo tường'))
      .toEqual([row]);
  });

  it('never creates a result when the requested code and alias are absent from live rows', () => {
    expect(resolvePopularServiceServices([service(1, 'c-13', 1)], 'MISSING_SERVICE', 'Không có thật'))
      .toEqual([]);
  });
});
