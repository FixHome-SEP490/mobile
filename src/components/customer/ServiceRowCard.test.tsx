import React from 'react';
import { Image, Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import ServiceRowCard from './ServiceRowCard';
import type { ServiceItem } from '../../api/services.api';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const service = (over: Partial<ServiceItem>): ServiceItem => ({
  id: 's1', name: 'Vệ sinh điều hòa', code: 'AC-02', categoryId: 'c1', pricingMode: 'inspection_required', isActive: true, ...over,
}) as ServiceItem;
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));

describe('ServiceRowCard', () => {
  it('shows the picture, the name and the labor price the catalog approved, and opens the service on tap', () => {
    const onPress = jest.fn();
    const item = service({ priceSummary: { kind: 'fixed_range', minLaborVnd: 199000, maxLaborVnd: 449000 } });
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<ServiceRowCard service={item} onPress={onPress} />); });
    expect(r.root.findAllByType(Image)).toHaveLength(1);
    expect(texts(r)).toEqual(expect.arrayContaining(['Vệ sinh điều hòa', expect.stringMatching(/199\.000.*–.*449\.000/), 'Giá công theo thiết bị/phạm vi']));
    const button = r.root.findByType(TouchableOpacity);
    expect(button.props.accessibilityLabel).toBe('Vệ sinh điều hòa');
    expect(button.props.accessibilityValue.text).toMatch(/199\.000.*Giá công theo thiết bị/);
    expect(button.props.accessibilityHint).toBe('Mở chi tiết dịch vụ');
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledWith(item);
  });

  it('keeps a neutral icon instead of a wrong picture for a service without artwork, and says "khảo sát" without a price', () => {
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<ServiceRowCard service={service({ code: 'ZZ-99', name: 'Dịch vụ mới' })} onPress={jest.fn()} />); });
    expect(r.root.findAllByType(Image)).toHaveLength(0);
    expect(texts(r)).toContain('Cần khảo sát để xác định chi phí');
  });
});
