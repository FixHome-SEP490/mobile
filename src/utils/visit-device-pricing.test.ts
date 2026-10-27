import { summarizeVisitDevicePrices, visitPriceText } from './visit-device-pricing';

const money = (n: number) => `${n}đ`;
describe('summarizeVisitDevicePrices', () => {
  it('sums firm prices and keeps ranges as ranges', () => {
    expect(summarizeVisitDevicePrices([{ kind: 'firm', amount: 100 }, { kind: 'firm', amount: 50 }])).toEqual({ kind: 'firm', amount: 150 });
    expect(summarizeVisitDevicePrices([{ kind: 'firm', amount: 100 }, { kind: 'range', min: 10, max: 20 }])).toEqual({ kind: 'range', min: 110, max: 120 });
  });
  it('never counts a survey device as zero', () => {
    expect(summarizeVisitDevicePrices([{ kind: 'firm', amount: 100 }, { kind: 'survey', from: null, to: null }])).toEqual({ kind: 'partial', confirmedTotal: 100, unresolvedCount: 1 });
    expect(summarizeVisitDevicePrices([{ kind: 'survey', from: 5, to: 9 }, { kind: 'none' }])).toEqual({ kind: 'survey', from: null, to: null });
    expect(summarizeVisitDevicePrices([])).toEqual({ kind: 'none' });
  });
  it('words each kind', () => {
    expect(visitPriceText({ kind: 'range', min: 1, max: 2 }, money)).toBe('1đ – 2đ');
    expect(visitPriceText({ kind: 'partial', confirmedTotal: 100, unresolvedCount: 2 }, money)).toBe('100đ đã xác định · 2 máy cần báo giá');
    expect(visitPriceText({ kind: 'survey', from: null, to: null }, money)).toBe('Thợ báo giá tại nhà');
  });
});
