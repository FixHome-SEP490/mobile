import type { AddressData, CreateAddressRequest } from '../../api/users.api';

export interface CustomerAddressWrite {
  ownerId: string;
  payload: Partial<CreateAddressRequest>;
  baselineIds: string[];
  knownId: string | null;
  posting: boolean;
}

// A timeout is not evidence of rejection. Preserve the lock across editor remounts.
export const customerProfileAddressWrites = new Map<string, CustomerAddressWrite>();

export function confirmedCustomerAddressWrite(attempt: CustomerAddressWrite, rows: AddressData[]) {
  if (attempt.posting) return undefined;
  return rows.find(row => {
    if (row.userId !== attempt.ownerId) return false;
    if (attempt.knownId ? row.id !== attempt.knownId : attempt.baselineIds.includes(row.id)) return false;
    return Object.entries(attempt.payload).every(([key, wanted]) => {
      if (wanted === undefined) return true;
      const actual = row[key as keyof AddressData];
      if ((key === 'lat' || key === 'lng') && typeof wanted === 'number') {
        return typeof actual === 'number' && Number.isFinite(actual) && Math.round(actual * 1e7) === Math.round(wanted * 1e7);
      }
      return wanted === null ? actual == null : actual === wanted;
    });
  });
}
