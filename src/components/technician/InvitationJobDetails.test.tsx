import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import InvitationJobDetails from './InvitationJobDetails';
import type { TechnicianBookingPreview } from '../../api/bookings.api';

jest.mock('lucide-react-native', () => ({ Sparkles: () => null }));
jest.mock('../../api/media.api', () => ({
  apiUrl: (p: string) => p,
  mediaApi: { getBookingPhotoUri: jest.fn().mockResolvedValue('data:image/jpeg;base64,AAAA'), getBookingVideoLink: jest.fn() },
}));

const base: TechnicianBookingPreview = {
  id: 'b1', province: 'P', district: 'D', serviceName: 'Sửa vòi', quantity: 2, urgency: 'medium',
  preferredStartAt: null, preferredEndAt: null,
};
const texts = (r: ReturnType<typeof create>) =>
  r.root.findAllByType(Text).map((n) => [n.props.children].flat().join('')).join('\n');

describe('InvitationJobDetails', () => {
  it('shows the customer words, listed price and the privacy note', () => {
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<InvitationJobDetails booking={{ ...base, description: 'Vòi rò', pricingMode: 'fixed_price', fixedUnitPrice: 100000 }} />); });
    expect(texts(r)).toContain('Vòi rò');
    expect(texts(r)).toMatch(/Giá niêm yết .* × 2/);
    expect(texts(r)).toContain('hiện sau khi bạn nhận đơn');
  });

  it('says so when there is no description or AI summary, and opens the summary on tap', () => {
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<InvitationJobDetails booking={base} />); });
    expect(texts(r)).toContain('Khách chưa ghi mô tả.');
    expect(r.root.findAllByType(TouchableOpacity)).toHaveLength(0);

    act(() => { r.update(<InvitationJobDetails booking={{ ...base, aiSummary: { conclusion: 'Hỏng gioăng', suspectedFaults: ['Gioăng mòn'] } }} />); });
    act(() => { r.root.findByType(TouchableOpacity).props.onPress(); });
    expect(texts(r)).toContain('Hỏng gioăng');
    expect(texts(r)).toContain('Gioăng mòn');
  });
});
