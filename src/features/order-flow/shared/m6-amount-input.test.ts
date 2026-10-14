import { parseWholeVndInput } from './m6-amount-input';

const TOP_UP = { min: 10000, max: 50000000 };
const CASH = { min: 0, max: 999999999999 };

it.each([
  ['120000', 120000],
  ['0', 0],
  ['  120000  ', 120000],
  ['120.000', 120000],
  ['1.250.000', 1250000],
  ['120.000 ₫', 120000],
  ['120000đ', 120000],
])('accepts whole input %p as %p', (text, expected) => {
  expect(parseWholeVndInput(text, CASH)).toBe(expected);
});

it.each([
  '', '   ', 'abc', '-120000', '+120000', '12ab', '120000.5', '10000.5', '10.000.5',
  '1.00.000', '12.00', '.000', '120000.', '1,250,000', '120 000', '12.34.567',
  '₫', '9999999999999',
])('rejects decimal/malformed input %p instead of reshaping it', text => {
  expect(parseWholeVndInput(text, CASH)).toBeNull();
});

it('keeps existing controller bounds: top-up floor/ceiling, cash zero allowed', () => {
  expect(parseWholeVndInput('9999', TOP_UP)).toBeNull();
  expect(parseWholeVndInput('10000', TOP_UP)).toBe(10000);
  expect(parseWholeVndInput('50000000', TOP_UP)).toBe(50000000);
  expect(parseWholeVndInput('50000001', TOP_UP)).toBeNull();
  expect(parseWholeVndInput('0', CASH)).toBe(0);
  expect(parseWholeVndInput('', CASH)).toBeNull();
});
