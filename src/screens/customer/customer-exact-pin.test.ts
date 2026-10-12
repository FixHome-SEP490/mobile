import {
  addressPinAfterManualEdit,
  confirmExactPin,
  isCurrentAddressAsyncResult,
  isValidCoordinates,
  makeCandidatePin,
  makePendingPin,
  resolveAddressSaveLocation,
  resolveReverseLookup,
  type AddressAsyncContext,
  type ExactPinState,
} from './customer-exact-pin';

describe('customer exact pin decisions', () => {
  it('accepts zero coordinates and rejects invalid or out-of-range values', () => {
    expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidCoordinates({ lat: 0, lng: 106 })).toBe(true);
    expect(isValidCoordinates({ lat: Number.NaN, lng: 106 })).toBe(false);
    expect(isValidCoordinates({ lat: 10, lng: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidCoordinates({ lat: 91, lng: 106 })).toBe(false);
    expect(isValidCoordinates({ lat: 10, lng: -181 })).toBe(false);
    expect(isValidCoordinates(null)).toBe(false);
  });

  it('does not allow a search candidate to become a saved confirmed pin', () => {
    const candidate = makeCandidatePin({ lat: 0, lng: 0 });

    expect(candidate).toEqual({ status: 'candidate', coordinates: { lat: 0, lng: 0 } });
    expect(confirmExactPin(candidate)).toBe(candidate);
    expect(resolveAddressSaveLocation({
      isCreating: true,
      addressText: 'Đường A, Quận B',
      province: 'Tỉnh C',
      district: 'Quận B',
      pin: candidate,
    })).toEqual({ kind: 'blocked', reason: 'pin-confirmation' });
  });

  it('requires confirmation after selecting a map or GPS coordinate', () => {
    const selected = makePendingPin({ lat: 0, lng: 0 }, 'map');

    expect(selected).toEqual({ status: 'pending-confirmation', source: 'map', coordinates: { lat: 0, lng: 0 } });
    expect(confirmExactPin(selected)).toEqual({ status: 'confirmed', source: 'map', coordinates: { lat: 0, lng: 0 } });
  });

  it('invalidates a confirmed pin when the address text changes', () => {
    const confirmed: ExactPinState = {
      status: 'confirmed',
      source: 'map',
      coordinates: { lat: 10, lng: 106 },
    };
    const result = addressPinAfterManualEdit('Địa chỉ mới', {
      line1: 'Địa chỉ cũ',
      lat: 10,
      lng: 106,
    }, confirmed);

    expect(result).toEqual({ status: 'none' });
  });

  it('keeps an existing saved pin only while its address text is unchanged', () => {
    const legacy = addressPinAfterManualEdit('Địa chỉ cũ', {
      line1: 'Địa chỉ cũ',
      lat: 0,
      lng: 106,
    }, { status: 'none' });

    expect(legacy).toEqual({ status: 'legacy', coordinates: { lat: 0, lng: 106 } });
    expect(resolveAddressSaveLocation({
      isCreating: false,
      addressText: 'Địa chỉ cũ',
      province: 'Tỉnh cũ',
      district: 'Quận cũ',
      pin: legacy,
      legacyAddress: { line1: 'Địa chỉ cũ', lat: 0, lng: 106 },
    })).toEqual({ kind: 'preserve-legacy', coordinates: { lat: 0, lng: 106 } });
  });

  it('does not invent coordinates for an unchanged legacy address without a valid pin', () => {
    const legacy = addressPinAfterManualEdit('Địa chỉ cũ', {
      line1: 'Địa chỉ cũ',
      lat: null,
      lng: Number.NaN,
    }, { status: 'none' });

    expect(legacy).toEqual({ status: 'legacy' });
    expect(resolveAddressSaveLocation({
      isCreating: false,
      addressText: 'Địa chỉ cũ',
      province: 'Tỉnh cũ',
      district: 'Quận cũ',
      pin: legacy,
      legacyAddress: { line1: 'Địa chỉ cũ', lat: null, lng: Number.NaN },
    })).toEqual({ kind: 'preserve-legacy' });
  });

  it('allows a text-only edit to a legacy address without preserving its old pin', () => {
    expect(resolveAddressSaveLocation({
      isCreating: false,
      addressText: 'Địa chỉ đã sửa',
      province: '',
      district: '',
      pin: { status: 'none' },
      legacyAddress: { line1: 'Địa chỉ cũ', lat: 10, lng: 106 },
    })).toEqual({ kind: 'legacy-text-only' });
  });

  it('allows a legacy address text update from a search candidate without persisting candidate coordinates', () => {
    const candidate = makeCandidatePin({ lat: 12, lng: 108 });

    expect(resolveAddressSaveLocation({
      isCreating: false,
      addressText: 'Địa chỉ gợi ý mới',
      province: 'Tỉnh mới',
      district: 'Huyện mới',
      pin: candidate,
      legacyAddress: {
        line1: 'Địa chỉ cũ',
        lat: 10,
        lng: 106,
        province: 'Tỉnh mới',
        district: 'Huyện mới',
      },
    })).toEqual({ kind: 'candidate-text-only' });
  });

  it('does not reuse legacy administrative codes for a different area without new codes', () => {
    expect(resolveAddressSaveLocation({
      isCreating: false,
      addressText: 'Địa chỉ tỉnh khác',
      province: 'Tỉnh mới',
      district: 'Huyện mới',
      pin: { status: 'confirmed', source: 'map', coordinates: { lat: 12, lng: 108 } },
      legacyAddress: {
        line1: 'Địa chỉ cũ',
        lat: 10,
        lng: 106,
        province: 'Tỉnh cũ',
        district: 'Huyện cũ',
      },
    })).toEqual({ kind: 'blocked', reason: 'administrative-area' });
  });

  it('blocks a new address until it has a new exact pin or a location suggestion', () => {
    expect(resolveAddressSaveLocation({
      isCreating: true,
      addressText: 'Địa chỉ tự nhập mới',
      province: '',
      district: '',
      pin: { status: 'none' },
    })).toEqual({ kind: 'blocked', reason: 'pin-confirmation' });
  });

  it('does not apply an asynchronous response after a newer request, editor, owner, or unmount', () => {
    const request: AddressAsyncContext = { requestId: 4, sessionId: 2, ownerId: 'customer-a', mounted: true };
    const active: AddressAsyncContext = { ...request };

    expect(isCurrentAddressAsyncResult(request, active)).toBe(true);
    expect(isCurrentAddressAsyncResult(request, { ...active, requestId: 5 })).toBe(false);
    expect(isCurrentAddressAsyncResult(request, { ...active, sessionId: 3 })).toBe(false);
    expect(isCurrentAddressAsyncResult(request, { ...active, ownerId: 'customer-b' })).toBe(false);
    expect(isCurrentAddressAsyncResult(request, { ...active, mounted: false })).toBe(false);
  });

  it('keeps the selected pin after reverse lookup failure and clears stale address labels', () => {
    const pin = makePendingPin({ lat: 10, lng: 106 }, 'gps');

    expect(resolveReverseLookup(pin, { lat: 10, lng: 106 }, null)).toEqual({
      kind: 'failed',
      pin,
      location: null,
    });
    expect(resolveReverseLookup(pin, { lat: 11, lng: 106 }, null)).toEqual({ kind: 'stale' });
  });
});
