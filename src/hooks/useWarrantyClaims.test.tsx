import React from 'react';
import { act, create } from 'react-test-renderer';
import { technicianWarrantyApi } from '../api/technician-warranty.api';
import { useWarrantyClaims } from './useWarrantyClaims';

jest.mock('./useLiveRefresh', () => ({ useLiveRefresh: jest.fn() }));
jest.mock('../services/live-kinds', () => ({ listsNeedRead: () => false }));

const page = { data: [{ id: '33333333-3333-4333-8333-333333333333' }], meta: { page: 1, pageSize: 20, total: 1 } };

it('shows the full-page loader for the first read only and reloads quietly afterwards', async () => {
  jest.spyOn(technicianWarrantyApi, 'listMine').mockResolvedValue(page as never);
  let latest!: ReturnType<typeof useWarrantyClaims>;
  const seenLoading: boolean[] = [];
  const Probe = () => { latest = useWarrantyClaims(); seenLoading.push(latest.loading); return null; };
  await act(async () => { create(<Probe />); });
  expect(latest.items).toHaveLength(1);
  expect(seenLoading).toContain(true);

  seenLoading.length = 0;
  await act(async () => { await latest.load(); });
  expect(seenLoading).not.toContain(true);
  expect(latest.items).toHaveLength(1);
});

it('shows the last list at once when the list is opened again', async () => {
  jest.spyOn(technicianWarrantyApi, 'listMine').mockResolvedValue(page as never);
  let first!: ReturnType<typeof useWarrantyClaims>;
  const Probe = () => { first = useWarrantyClaims(); return null; };
  await act(async () => { create(<Probe />); });
  expect(first.loading).toBe(false);
  expect(first.items).toHaveLength(1);
});
