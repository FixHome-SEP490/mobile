import { areasChanged, initialProvince, toAreaKey } from './technician-service-areas';

test('opens on the province holding most saved areas', () => {
  expect(initialProvince([toAreaKey(79, 760), toAreaKey(79, 761), toAreaKey(1, 1)])).toBe(79);
  expect(initialProvince([toAreaKey(1, 1)])).toBe(1);
  expect(initialProvince([])).toBe(79);
});

test('offers saving only when the selection changed', () => {
  const saved = [{ provinceCode: '79', districtCode: '760' }];
  expect(areasChanged(saved, ['79:760'])).toBe(false);
  expect(areasChanged(saved, ['79:760', '79:761'])).toBe(true);
  expect(areasChanged(saved, [])).toBe(true);
});
