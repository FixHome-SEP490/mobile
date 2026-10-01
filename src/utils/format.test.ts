import { formatVnd, parseVnDateInput, vndText } from './format';

describe('formatVnd', () => {
  it('groups thousands with dots and a non-breaking ₫', () => {
    expect(formatVnd(1250000)).toBe('1.250.000 ₫');
    expect(formatVnd(999)).toBe('999 ₫');
  });

  it('keeps 0 and negatives distinct from missing', () => {
    expect(formatVnd(0)).toBe('0 ₫');
    expect(formatVnd(-50000)).toBe('-50.000 ₫');
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
    expect(formatVnd(NaN)).toBe('—');
    expect(formatVnd('5' as unknown as number)).toBe('—');
  });
});

describe('parseVnDateInput', () => {
  it('turns dd/MM/yyyy into a calendar date without timezone shifts', () => {
    expect(parseVnDateInput('30/09/2026')).toBe('2026-09-30');
    expect(parseVnDateInput(' 1-2-2027 ')).toBe('2027-02-01');
    expect(parseVnDateInput('05.10.2026')).toBe('2026-10-05');
  });

  it('rejects impossible or malformed dates', () => {
    expect(parseVnDateInput('31/02/2026')).toBeNull();
    expect(parseVnDateInput('2026-09-30')).toBeNull();
    expect(parseVnDateInput('30/13/2026')).toBeNull();
    expect(parseVnDateInput('')).toBeNull();
    expect(parseVnDateInput('30/09/26')).toBeNull();
  });
});

describe('vndText', () => {
  it('re-renders helper-formatted amounts with the ₫ sign and leaves everything else alone', () => {
    expect(vndText('1.250.000đ')).toBe('1.250.000 ₫');
    expect(vndText('-50.000 đ')).toBe('-50.000 ₫');
    expect(vndText('—')).toBe('—');
    expect(vndText(null)).toBeNull();
    expect(vndText(undefined)).toBeUndefined();
  });
});
