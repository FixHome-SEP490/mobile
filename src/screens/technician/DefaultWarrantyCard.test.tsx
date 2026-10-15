import React from 'react';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import { technicianProfileApi } from '../../api/technician-profile.api';
import DefaultWarrantyCard from './DefaultWarrantyCard';

jest.mock('../../api/technician-profile.api', () => ({ technicianProfileApi: { setDefaultLaborWarranty: jest.fn() } }));
const api = technicianProfileApi as jest.Mocked<typeof technicianProfileApi>;

function mount(saved: number | null, onSaved = jest.fn()) {
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<DefaultWarrantyCard saved={saved} onSaved={onSaved} />); });
  return r;
}
const find = (r: ReturnType<typeof create>, id: string) => r.root.findAllByProps({ testID: id });
const type = (r: ReturnType<typeof create>, v: string) => act(() => find(r, 'default-warranty-input')[0].props.onChangeText(v));

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });

describe('DefaultWarrantyCard', () => {
  it('hides save until changed and refuses more than 365 days', () => {
    const r = mount(30);
    expect(find(r, 'default-warranty-save')).toHaveLength(0);
    type(r, '366');
    expect(find(r, 'default-warranty-save')[0].props.disabled).toBe(true);
    type(r, '90');
    expect(find(r, 'default-warranty-save')[0].props.disabled).toBe(false);
  });

  it('saves the days with the apply-to-all flag', async () => {
    api.setDefaultLaborWarranty.mockResolvedValue({ defaultLaborWarrantyDays: 90, servicesUpdated: 2 });
    const onSaved = jest.fn();
    const r = mount(null, onSaved);
    type(r, '90');
    act(() => find(r, 'default-warranty-all')[0].props.onValueChange(true));
    await act(async () => { find(r, 'default-warranty-save')[0].props.onPress(); });
    expect(api.setDefaultLaborWarranty).toHaveBeenCalledWith(90, true);
    expect(onSaved).toHaveBeenCalledWith(90);
  });
});
