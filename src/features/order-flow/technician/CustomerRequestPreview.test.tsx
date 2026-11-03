import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import CustomerRequestPreview from './CustomerRequestPreview';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const order = (extra: object) => ({ id: 'o', bookingDescription: '', customerNote: null, ...extra }) as never;
const render = async (o: never | null) => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<CustomerRequestPreview order={o} />); }); return r; };
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));

beforeEach(() => mockNavigate.mockClear());

it('shows what the customer wrote, cut to three lines, with the note', async () => {
  const r = await render(order({ bookingDescription: 'Điều hòa chảy nước dàn lạnh', customerNote: 'Gọi trước khi tới' }));
  expect(texts(r)).toEqual(expect.arrayContaining(['Khách mô tả', 'Điều hòa chảy nước dàn lạnh', 'Ghi chú: Gọi trước khi tới', 'Xem thông tin đơn']));
  expect(r.root.findAllByType(Text).find((n) => n.props.children === 'Điều hòa chảy nước dàn lạnh')!.props.numberOfLines).toBe(3);
});

it('shows only the note when there is no description, and only the description when there is no note', async () => {
  expect(texts(await render(order({ customerNote: 'Cổng màu xanh' })))).toContain('Ghi chú: Cổng màu xanh');
  const onlyDescription = texts(await render(order({ bookingDescription: 'Máy kêu to' })));
  expect(onlyDescription).toContain('Máy kêu to');
  expect(onlyDescription.some((t) => t.startsWith('Ghi chú'))).toBe(false);
});

it('counts the photos the customer attached, even with no text', async () => {
  const m = { id: 'm', url: null, isPrivate: true, mimeType: 'image/jpeg' };
  expect(texts(await render(order({ bookingMedia: [m, m] })))).toContain('2 ảnh/video của khách');
});

it('renders nothing when the customer wrote nothing, or when there is no order to read', async () => {
  expect((await render(order({ bookingDescription: '   ', customerNote: '  ' }))).toJSON()).toBeNull();
  expect((await render(null)).toJSON()).toBeNull();
});

it('opens the full request on tap', async () => {
  const r = await render(order({ bookingDescription: 'Máy kêu to' }));
  await act(async () => r.root.findAll((n) => n.props.testID === 'customer-request-preview' && typeof n.props.onPress === 'function')[0].props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('OrderInformation');
});
