export interface ExactPinCoordinates {
  lat: number;
  lng: number;
}

export type ExactPinState =
  | { status: 'none' }
  | { status: 'candidate'; coordinates?: ExactPinCoordinates }
  | { status: 'pending-confirmation'; source: 'map' | 'gps'; coordinates: ExactPinCoordinates }
  | { status: 'confirmed'; source: 'map' | 'gps'; coordinates: ExactPinCoordinates }
  | { status: 'legacy'; coordinates?: ExactPinCoordinates };

export interface AddressAsyncContext {
  requestId: number;
  sessionId: number;
  ownerId: string | null;
  mounted: boolean;
}

export interface LegacyAddressLocation {
  line1: string;
  lat?: unknown;
  lng?: unknown;
  district?: string | null;
  province?: string | null;
}

export interface ReverseLocation {
  formattedAddress: string;
  ward?: string;
  district?: string;
  province?: string;
  provinceCode?: string;
  districtCode?: string;
}

export function isValidCoordinates(value: unknown): value is ExactPinCoordinates {
  if (!value || typeof value !== 'object') return false;
  const coordinates = value as Partial<ExactPinCoordinates>;
  return typeof coordinates.lat === 'number'
    && Number.isFinite(coordinates.lat)
    && coordinates.lat >= -90
    && coordinates.lat <= 90
    && typeof coordinates.lng === 'number'
    && Number.isFinite(coordinates.lng)
    && coordinates.lng >= -180
    && coordinates.lng <= 180;
}

export function makeCandidatePin(coordinates: ExactPinCoordinates): ExactPinState {
  return isValidCoordinates(coordinates)
    ? { status: 'candidate', coordinates }
    : { status: 'candidate' };
}

export function makePendingPin(
  coordinates: ExactPinCoordinates,
  source: 'map' | 'gps',
): ExactPinState {
  return isValidCoordinates(coordinates)
    ? { status: 'pending-confirmation', source, coordinates }
    : { status: 'none' };
}

export function confirmExactPin(pin: ExactPinState): ExactPinState {
  if (pin.status === 'pending-confirmation' && isValidCoordinates(pin.coordinates)) {
    return { ...pin, status: 'confirmed' };
  }
  return pin;
}

export function addressPinAfterManualEdit(
  addressText: string,
  legacyAddress: LegacyAddressLocation | null,
  currentPin: ExactPinState,
): ExactPinState {
  if (!legacyAddress || addressText !== legacyAddress.line1) return { status: 'none' };
  if (currentPin.status === 'legacy') return currentPin;

  const coordinates = { lat: legacyAddress.lat, lng: legacyAddress.lng };
  return isValidCoordinates(coordinates)
    ? { status: 'legacy', coordinates }
    : { status: 'legacy' };
}

export function isCurrentAddressAsyncResult(
  request: AddressAsyncContext,
  active: AddressAsyncContext,
): boolean {
  return request.mounted
    && active.mounted
    && request.requestId === active.requestId
    && request.sessionId === active.sessionId
    && request.ownerId === active.ownerId;
}

export type AddressSaveLocationDecision =
  | { kind: 'blocked'; reason: 'pin-confirmation' | 'administrative-area' }
  | { kind: 'confirmed'; coordinates: ExactPinCoordinates }
  | { kind: 'preserve-legacy'; coordinates?: ExactPinCoordinates }
  | { kind: 'candidate-text-only' }
  | { kind: 'legacy-text-only' };

export function resolveAddressSaveLocation(input: {
  isCreating: boolean;
  addressText: string;
  province: string;
  district: string;
  provinceCode?: string;
  districtCode?: string;
  pin: ExactPinState;
  legacyAddress?: LegacyAddressLocation;
}): AddressSaveLocationDecision {
  const coordinates = input.pin.status === 'confirmed'
    ? input.pin.coordinates
    : undefined;
  if (coordinates && isValidCoordinates(coordinates)) {
    if (!input.province.trim() || !input.district.trim()) {
      return { kind: 'blocked', reason: 'administrative-area' };
    }
    if (!input.isCreating
      && input.legacyAddress
      && (!sameAdministrativeArea(input.province, input.legacyAddress.province)
        || !sameAdministrativeArea(input.district, input.legacyAddress.district))
      && (!input.provinceCode?.trim() || !input.districtCode?.trim())) {
      return { kind: 'blocked', reason: 'administrative-area' };
    }
    return { kind: 'confirmed', coordinates };
  }

  if (!input.isCreating
    && input.pin.status === 'legacy'
    && input.legacyAddress
    && input.addressText === input.legacyAddress.line1) {
    return input.pin.coordinates
      ? { kind: 'preserve-legacy', coordinates: input.pin.coordinates }
      : { kind: 'preserve-legacy' };
  }

  if (!input.isCreating
    && input.pin.status === 'candidate'
    && input.legacyAddress
    && input.addressText !== input.legacyAddress.line1
    && input.province.trim()
    && input.district.trim()
    && sameAdministrativeArea(input.province, input.legacyAddress.province)
    && sameAdministrativeArea(input.district, input.legacyAddress.district)) {
    return { kind: 'candidate-text-only' };
  }

  if (!input.isCreating
    && input.pin.status === 'none'
    && input.legacyAddress
    && input.addressText !== input.legacyAddress.line1) {
    return { kind: 'legacy-text-only' };
  }

  return { kind: 'blocked', reason: 'pin-confirmation' };
}

function sameAdministrativeArea(value: string, savedValue?: string | null): boolean {
  if (typeof savedValue !== 'string') return false;
  return value.trim().toLocaleLowerCase('vi-VN') === savedValue.trim().toLocaleLowerCase('vi-VN');
}

export type ReverseLookupDecision =
  | { kind: 'stale' }
  | { kind: 'failed'; pin: ExactPinState; location: null }
  | { kind: 'resolved'; pin: ExactPinState; location: ReverseLocation };

export function resolveReverseLookup(
  pin: ExactPinState,
  requested: ExactPinCoordinates,
  location: ReverseLocation | null,
): ReverseLookupDecision {
  const activeCoordinates = pin.status === 'none' ? undefined : pin.coordinates;
  if (!activeCoordinates
    || !isValidCoordinates(activeCoordinates)
    || activeCoordinates.lat !== requested.lat
    || activeCoordinates.lng !== requested.lng
    || (pin.status !== 'pending-confirmation' && pin.status !== 'confirmed')) {
    return { kind: 'stale' };
  }

  return location
    ? { kind: 'resolved', pin, location }
    : { kind: 'failed', pin, location: null };
}
