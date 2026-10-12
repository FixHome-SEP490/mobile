import { customerDiscoveryColumns, displayCustomerServiceName } from './customer-display';

describe('customer service display labels', () => {
  it('shortens known long catalog names by code and leaves source data as the fallback', () => {
    expect(
      displayCustomerServiceName(
        'SUA_DIEU_HOA',
        'Sửa điều hòa không mát / chảy nước',
      ),
    ).toBe('Sửa điều hòa');
    expect(displayCustomerServiceName('NEW_BACKEND_CODE', 'Dịch vụ mới')).toBe('Dịch vụ mới');
    expect(displayCustomerServiceName(undefined, 'Tên dịch vụ chưa có mã')).toBe('Tên dịch vụ chưa có mã');
    expect(displayCustomerServiceName('MO_KHOA_KHAN_CAP', 'Mở khóa cửa khẩn cấp 24/7')).toBe('Mở khóa khẩn cấp 24/7');
    expect(displayCustomerServiceName('LAP_TV_GIA_TREO', 'Lắp TV lên giá treo có sẵn')).toBe('Lắp TV lên giá treo sẵn');
    expect(displayCustomerServiceName('SUA_MAY_HUT_MUI', 'Vệ sinh & sửa motor máy hút mùi')).toBe('Vệ sinh/sửa motor hút mùi');
  });

  it('uses two columns on narrow or enlarged-text layouts and three on standard layouts', () => {
    expect(customerDiscoveryColumns(360, 1)).toBe(2);
    expect(customerDiscoveryColumns(390, 1)).toBe(3);
    expect(customerDiscoveryColumns(430, 1)).toBe(3);
    expect(customerDiscoveryColumns(430, 1.2)).toBe(2);
  });
});
