import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import ServiceDeviceDetails from './ServiceDeviceDetails';
import { catalogPricingApi, normalizePricingPreview } from '../../api/catalog-pricing.api';

jest.mock('../../api/catalog-pricing.api', () => ({
  ...jest.requireActual('../../api/catalog-pricing.api'),
  catalogPricingApi: { getPreview: jest.fn() },
}));
const getPreview = catalogPricingApi.getPreview as jest.Mock;
const variant = { variantId: 'v1', variantCode: 'AC-01-02', scopeVi: 'Vệ sinh máy treo tường', laborPriceVnd: 150000 };
const base = { serviceId: 's1', serviceCode: 'AC-01', bindingReady: false, possibleVariants: [variant], priceRange: null, messageVi: '' };
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map((n) => [n.props.children].flat().join('')).join('\n');
const answer = (data: Record<string, unknown>) => normalizePricingPreview({ success: true, statusCode: 200, message: 'ok', data });
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

function mount(over: Record<string, unknown> = {}) {
  const handlers = { onChangeAttributes: jest.fn(), onChangeVariantCode: jest.fn(), onPreview: jest.fn() };
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<ServiceDeviceDetails serviceId="s1" deviceAttributes={{}} selectedVariantCode={null} {...handlers} {...over} />);
  });
  return { r, ...handlers };
}

beforeEach(() => getPreview.mockReset());

it('hides itself when the backend says the feature is not available', async () => {
  getPreview.mockRejectedValue({ response: { status: 404 } });
  const { r, onPreview } = mount();
  await flush();
  expect(r.toJSON()).toBeNull();
  expect(onPreview).toHaveBeenLastCalledWith(null);
});

it('asks only the missing question, then reports the server-confirmed scope and price', async () => {
  getPreview.mockResolvedValueOnce(answer({
    ...base, status: 'INSPECTION_REQUIRED', selectedVariant: null, missingAttributes: ['acMounting'],
  }));
  const { r, onChangeAttributes, onChangeVariantCode, onPreview } = mount();
  await flush();
  expect(texts(r)).toContain('Cách lắp đặt dàn lạnh');
  expect(texts(r)).not.toContain('Công suất máy lạnh');

  getPreview.mockResolvedValueOnce(answer({
    ...base, status: 'FIXED_PRICE', bindingReady: true, selectedVariant: variant, missingAttributes: [],
  }));
  const wall = r.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityRole === 'radio' && t.props.testID === 'x' || t.findAllByType(Text).some((x) => x.props.children === 'Treo tường'))!;
  await act(async () => { wall.props.onPress(); });
  await flush();
  expect(onChangeAttributes).toHaveBeenCalledWith({ acMounting: 'wall' });
  expect(getPreview).toHaveBeenLastCalledWith('s1', { acMounting: 'wall' }, expect.anything());
  expect(onChangeVariantCode).toHaveBeenLastCalledWith('AC-01-02');
  expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FIXED_PRICE' }));
});

it('never turns a failed preview into a price, and retries on demand', async () => {
  getPreview.mockRejectedValueOnce(new Error('boom'));
  const { r, onChangeVariantCode } = mount();
  await flush();
  expect(texts(r)).toContain('Chưa tải được thông tin giá của dịch vụ.');
  expect(texts(r)).not.toMatch(/Giá tham khảo|Phạm vi đã xác nhận/);
  expect(onChangeVariantCode).not.toHaveBeenCalledWith('AC-01-02');
  getPreview.mockResolvedValueOnce(answer({
    ...base, status: 'INSPECTION_REQUIRED', selectedVariant: null, missingAttributes: [],
  }));
  await act(async () => { r.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityRole === 'button')!.props.onPress(); });
  await flush();
  expect(texts(r)).toContain('Cần khảo sát để báo giá');
});
