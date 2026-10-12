import { confirmedCustomerAddressWrite, type CustomerAddressWrite } from './customer-address-write';
import { canonicalCustomerAddressArea } from './customer-administrative-area';
import type { AddressData } from '../../api/users.api';

const attempt: CustomerAddressWrite = { ownerId: 'customer', payload: { line1: 'Street', lat: 10.123456789, lng: 106.987654321 }, baselineIds: ['old'], knownId: null, posting: false };
const row = { id: 'new', userId: 'customer', line1: 'Street', lat: 10.1234568, lng: 106.9876543 } as AddressData;

it('reconciles storage rounding but rejects other owners, old rows, and in-flight writes', () => {
  expect(confirmedCustomerAddressWrite(attempt, [row])).toBe(row);
  expect(confirmedCustomerAddressWrite(attempt, [{ ...row, userId: 'another' }])).toBeUndefined();
  expect(confirmedCustomerAddressWrite(attempt, [{ ...row, id: 'old' }])).toBeUndefined();
  expect(confirmedCustomerAddressWrite({ ...attempt, posting: true }, [row])).toBeUndefined();
});
it('requires both the acknowledged update id and exact saved fields', () => {
  const updated = { ...attempt, knownId: 'old' };
  expect(confirmedCustomerAddressWrite(updated, [row])).toBeUndefined();
  expect(confirmedCustomerAddressWrite(updated, [{ ...row, id: 'old', lng: 105 }])).toBeUndefined();
  expect(confirmedCustomerAddressWrite(updated, [{ ...row, id: 'old' }])?.id).toBe('old');
});
it('does not guess a ward from a historical district or incomplete reverse', () => {
  expect(canonicalCustomerAddressArea({ formattedAddress: 'Street' }).district).toBe('');
  expect(canonicalCustomerAddressArea({ formattedAddress: 'Street', provinceCode: '79', district: 'Quận 1', districtCode: '760' }).districtCode).toBeUndefined();
});
it('resolves an explicitly named canonical ward without using historical district codes', () => {
  expect(canonicalCustomerAddressArea({ formattedAddress: 'Street', provinceCode: '79', ward: 'Phường Bến Thành', district: 'Quận 1', districtCode: '760' })).toEqual({ province: 'Thành phố Hồ Chí Minh', provinceCode: '79', ward: 'Phường Bến Thành', district: 'Phường Bến Thành', districtCode: '26743' });
});
it('rejects conflicting province codes and known province names', () => {
  expect(canonicalCustomerAddressArea({ formattedAddress: 'Street', province: 'Thành phố Hà Nội', provinceCode: '79' }).province).toBe('');
});
