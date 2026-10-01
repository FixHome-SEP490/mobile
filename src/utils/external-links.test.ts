import { Alert, Linking } from 'react-native';
import { mapsUrl, openExternal, telUrl } from './external-links';

describe('telUrl', () => {
  it('keeps digits and a leading +', () => {
    expect(telUrl('0904 000.001')).toBe('tel:0904000001');
    expect(telUrl('+84 904-000-001')).toBe('tel:+84904000001');
  });
  it('rejects empty or too-short input', () => {
    expect(telUrl('')).toBeNull();
    expect(telUrl(null)).toBeNull();
    expect(telUrl('123')).toBeNull();
    expect(telUrl('ab')).toBeNull();
  });
});

describe('mapsUrl', () => {
  it('encodes the address as a search query', () => {
    expect(mapsUrl('12 Nguyễn Trãi, Q.1')).toBe(
      'https://www.google.com/maps/search/?api=1&query=12%20Nguy%E1%BB%85n%20Tr%C3%A3i%2C%20Q.1',
    );
  });
  it('returns null for blank addresses', () => {
    expect(mapsUrl('  ')).toBeNull();
    expect(mapsUrl(undefined)).toBeNull();
  });
});

describe('openExternal', () => {
  let open: jest.SpyInstance;
  let alert: jest.SpyInstance;
  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { open.mockClear(); alert.mockClear(); });
  it('opens the link', async () => {
    await openExternal('tel:0904000001', 't', 'm');
    expect(open).toHaveBeenCalledWith('tel:0904000001');
  });
  it('alerts instead of throwing when the device cannot open it', async () => {
    open.mockRejectedValueOnce(new Error('no app'));
    await openExternal('tel:0904000001', 'Không thể gọi', 'msg');
    expect(alert).toHaveBeenCalledWith('Không thể gọi', 'msg');
  });
  it('does nothing for a null link', async () => {
    await openExternal(null, 't', 'm');
    expect(open).not.toHaveBeenCalled();
  });
});
