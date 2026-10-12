import apiClient from './client';
import { mediaApi } from './media.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

class FakeFormData {
  entries: [string, unknown][] = [];

  append(name: string, value: unknown) {
    this.entries.push([name, value]);
  }
}

const post = apiClient.post as jest.Mock;
const originalFormData = globalThis.FormData;

beforeEach(() => {
  jest.resetAllMocks();
  (globalThis as unknown as { FormData: typeof FakeFormData }).FormData = FakeFormData;
});

afterAll(() => {
  globalThis.FormData = originalFormData;
});

describe('mediaApi.uploadPublicImage', () => {
  it('uploads exactly one file field without hardcoding a multipart boundary', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          url: 'https://cdn.example/avatar.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1234,
          filename: 'avatar.jpg',
        },
      },
    });

    const result = await mediaApi.uploadPublicImage({
      uri: 'file:///avatar.jpg',
      name: 'avatar.jpg',
      type: 'image/jpeg',
    });

    expect(result).toEqual({
      url: 'https://cdn.example/avatar.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
      filename: 'avatar.jpg',
    });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('/media/upload');
    expect(body).toBeInstanceOf(FakeFormData);
    expect((body as FakeFormData).entries).toEqual([
      ['file', {
        uri: 'file:///avatar.jpg',
        name: 'avatar.jpg',
        type: 'image/jpeg',
      }],
    ]);
    expect(config).toEqual({
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    expect(JSON.stringify(config)).not.toMatch(/boundary=/i);
  });

  it('accepts a direct payload shape but still requires a durable hosted image URL', async () => {
    post.mockResolvedValue({
      data: {
        url: 'https://cdn.example/avatar.webp',
        mimeType: 'image/webp',
        sizeBytes: 999,
        filename: 'avatar.webp',
      },
    });

    await expect(mediaApi.uploadPublicImage({
      uri: 'file:///avatar.webp',
      name: 'avatar.webp',
      type: 'image/webp',
    })).resolves.toMatchObject({
      url: 'https://cdn.example/avatar.webp',
    });
  });

  it.each([
    {
      url: 'file:///avatar.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      filename: 'avatar.jpg',
    },
    {
      url: 'https://cdn.example/avatar.gif',
      mimeType: 'image/gif',
      sizeBytes: 12,
      filename: 'avatar.gif',
    },
    {
      url: 'https://cdn.example/avatar.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 0,
      filename: 'avatar.jpg',
    },
  ])('fails closed on malformed media metadata %#', async (payload) => {
    post.mockResolvedValue({ data: { data: payload } });

    await expect(mediaApi.uploadPublicImage({
      uri: 'file:///avatar.jpg',
      name: 'avatar.jpg',
      type: 'image/jpeg',
    })).rejects.toThrow(/không hợp lệ/i);
  });
});

describe('mediaApi.uploadBookingPhoto', () => {
  it('sends one file to the private Booking route and returns only its upload metadata', async () => {
    post.mockResolvedValue({
      status: 201,
      data: {
        data: {
          uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          objectRef: 'private/object/ref',
          url: 'https://private.example/photo.jpg',
        },
      },
    });

    const result = await mediaApi.uploadBookingPhoto({
      uri: 'file:///issue.jpg',
      name: 'issue.jpg',
      type: 'image/jpeg',
    });

    expect(result).toEqual({
      uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    expect(result).not.toHaveProperty('objectRef');
    expect(result).not.toHaveProperty('url');
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('/media/booking-photo-upload');
    expect((body as FakeFormData).entries).toEqual([
      ['file', {
        uri: 'file:///issue.jpg',
        name: 'issue.jpg',
        type: 'image/jpeg',
      }],
    ]);
    expect(config).toEqual({
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  });

  it.each([
    { uploadId: 'not-a-uuid', mimeType: 'image/jpeg', sizeBytes: 10 },
    { uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a', mimeType: 'image/gif', sizeBytes: 10 },
    { uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a', mimeType: 'image/png', sizeBytes: 0 },
    { uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a', mimeType: 'image/webp', sizeBytes: 10 * 1024 * 1024 + 1 },
  ])('fails closed on invalid private upload metadata %#', async (payload) => {
    post.mockResolvedValue({ status: 201, data: { data: payload } });

    await expect(mediaApi.uploadBookingPhoto({
      uri: 'file:///issue.jpg',
      name: 'issue.jpg',
      type: 'image/jpeg',
    })).rejects.toThrow(/không hợp lệ/i);
  });

  it('requires HTTP 201 and the exact wrapped response body', async () => {
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        data: {
          uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
        },
      },
    });

    await expect(mediaApi.uploadBookingPhoto({
      uri: 'file:///issue.jpg',
      name: 'issue.jpg',
      type: 'image/jpeg',
    })).rejects.toThrow(/xác nhận/i);

    post.mockResolvedValueOnce({
      status: 201,
      data: {
        uploadId: '8f9c9a41-bc0e-4a25-99a6-16e8d11c2c9a',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
      },
    });

    await expect(mediaApi.uploadBookingPhoto({
      uri: 'file:///issue.jpg',
      name: 'issue.jpg',
      type: 'image/jpeg',
    })).rejects.toThrow(/không hợp lệ/i);
  });
});
