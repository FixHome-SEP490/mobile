import areas from './customer-administrative-areas.json';
import type { ReverseLocation } from './customer-exact-pin';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase().replace(/^(thanh pho|tinh|phuong|xa|dac khu)\s+/, '');

/** Resolve only exact canonical names/codes. Historical districts never select a ward. */
export function canonicalCustomerAddressArea(location: ReverseLocation) {
  const province = areas.find(item => location.provinceCode ? item.code === location.provinceCode : normalize(item.name) === normalize(location.province ?? ''));
  if (!province) return { province: '', district: '', ward: '' };
  const namedProvince = location.province && areas.find(item => normalize(item.name) === normalize(location.province!));
  if (namedProvince && namedProvince.code !== province.code) return { province: '', district: '', ward: '' };
  const name = location.ward || location.district || '';
  const district = province.districts.find(item => name
    ? normalize(item.name) === normalize(name)
    : !!location.districtCode && item.code === location.districtCode);
  return {
    province: province.name, provinceCode: province.code,
    district: district?.name ?? '', districtCode: district?.code,
    ward: district?.name ?? '',
  };
}
