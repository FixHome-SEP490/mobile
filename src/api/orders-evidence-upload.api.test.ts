import apiClient from './client';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const post = apiClient.post as jest.Mock;

const appends: [string, unknown][] = [];
class FakeFormData {
  append = jest.fn((name: string, value: unknown) => {
    appends.push([name, value]);
  });
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  post.mockReset();
  appends.length = 0;
  (globalThis as unknown as { FormData: unknown }).FormData = FakeFormData;
  post.mockResolvedValue({ data: { data: { id: 'ev-1' } } });
});

describe('uploadEvidenceBefore multipart contract (BEFORE only)', () => {
  const image = { uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

  it('POSTs native multipart fields type=before and file {uri,name,type}', async () => {
    await ordersApi.uploadEvidenceBefore(ORDER_ID, image);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe(`/service-orders/${ORDER_ID}/evidence`);
    expect(body).toBeInstanceOf(FakeFormData);
    expect(appends).toContainEqual(['type', 'before']);
    expect(appends).toContainEqual(['file', image]);
    expect(appends.filter(([name]) => name === 'type')).toHaveLength(1);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('never hardcodes a multipart boundary and never sends another evidence type', async () => {
    await ordersApi.uploadEvidenceBefore(ORDER_ID, image);
    const [, , config] = post.mock.calls[0];
    expect(JSON.stringify(config)).not.toMatch(/boundary/i);
    expect(appends.map(([name]) => name).sort()).toEqual(['file', 'type']);
    const rendered = JSON.stringify(appends);
    expect(rendered).not.toMatch(/after|additional/i);
  });

  it('unwraps the {data} envelope without touching the global JSON client', async () => {
    const result = await ordersApi.uploadEvidenceBefore(ORDER_ID, image);
    expect(result).toEqual({ id: 'ev-1' });
    // Per-request override only: the shared client mock exposes no global
    // header mutation surface, and this module never writes client defaults.
    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  });

  it('passes the raw private POST body through for the caller to ignore (never rendered)', async () => {
    post.mockResolvedValue({ data: { data: { id: 'ev-2', mediaUrl: 'storage://bucket/ev-2' } } });
    const result = await ordersApi.uploadEvidenceBefore(ORDER_ID, image);
    expect(result).toEqual({ id: 'ev-2', mediaUrl: 'storage://bucket/ev-2' });
  });
});

describe('uploadEvidenceAfter multipart contract (AFTER only)', () => {
  const image = { uri: 'file:///cache/after.jpg', name: 'after.jpg', type: 'image/jpeg' };

  it('POSTs the same route with exact lowercase type=after and one file', async () => {
    await ordersApi.uploadEvidenceAfter(ORDER_ID, image);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe(`/service-orders/${ORDER_ID}/evidence`);
    expect(body).toBeInstanceOf(FakeFormData);
    expect(appends).toContainEqual(['type', 'after']);
    expect(appends).toContainEqual(['file', image]);
    expect(appends.map(([name]) => name).sort()).toEqual(['file', 'type']);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(JSON.stringify(config)).not.toMatch(/boundary/i);
    const rendered = JSON.stringify(appends);
    expect(rendered).not.toMatch(/before|additional/i);
  });

  it('leaves the BEFORE helper untouched (regression)', async () => {
    const beforeImage = { uri: 'file:///cache/before.jpg', name: 'before.jpg', type: 'image/png' };
    await ordersApi.uploadEvidenceBefore(ORDER_ID, beforeImage);
    expect(appends).toContainEqual(['type', 'before']);
    expect(appends).toContainEqual(['file', beforeImage]);
  });
});
