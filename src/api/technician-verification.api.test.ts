import { technicianVerificationApi } from './technician-verification.api';
import apiClient from './client';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedClient = apiClient as unknown as {
  get: jest.Mock;
  post: jest.Mock;
};

describe('technicianVerificationApi', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getMyVerification', () => {
    it('returns null when no verification has been submitted yet', async () => {
      mockedClient.get.mockResolvedValue({ data: { data: null } });

      await expect(technicianVerificationApi.getMyVerification()).resolves.toBeNull();
      expect(mockedClient.get).toHaveBeenCalledWith('/technicians/me/verification');
    });

    it('normalizes a pending verification and maps legacy "approved" to VERIFIED', async () => {
      mockedClient.get.mockResolvedValue({
        data: {
          data: {
            id: 'v1',
            status: 'approved',
            submittedAt: '2026-01-01T00:00:00.000Z',
            rejectionReason: null,
            documents: [{ documentType: 'citizen_id_front', fileName: 'front.jpg' }],
          },
        },
      });

      const result = await technicianVerificationApi.getMyVerification();
      expect(result?.status).toBe('VERIFIED');
      expect(result?.documents).toEqual([
        { documentType: 'citizen_id_front', fileName: 'front.jpg' },
      ]);
    });

    it('throws on an unsupported backend status instead of silently misreporting it', async () => {
      mockedClient.get.mockResolvedValue({ data: { data: { id: 'v1', status: 'weird' } } });

      await expect(technicianVerificationApi.getMyVerification()).rejects.toThrow(
        'unsupported verification status',
      );
    });
  });

  describe('requestUploadUrl', () => {
    it('posts the mimeType and returns the signed upload slot', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          data: {
            storageObjectPath: 'kyc/tech-1/abc.jpg',
            uploadUrl: 'https://storage.example/upload?token=xyz',
            token: 'xyz',
          },
        },
      });

      const slot = await technicianVerificationApi.requestUploadUrl('image/jpeg');

      expect(mockedClient.post).toHaveBeenCalledWith(
        '/technicians/me/verification/documents/upload-url',
        { mimeType: 'image/jpeg' },
      );
      expect(slot).toEqual({
        storageObjectPath: 'kyc/tech-1/abc.jpg',
        uploadUrl: 'https://storage.example/upload?token=xyz',
        token: 'xyz',
      });
    });
  });

  describe('uploadToSignedUrl', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('reads the local file and PUTs its bytes with the given mimeType', async () => {
      const blob = { size: 123 };
      const fetchMock = jest
        .fn()
        // 1st call: read local file URI into a blob
        .mockResolvedValueOnce({ blob: () => Promise.resolve(blob) })
        // 2nd call: PUT to the signed URL
        .mockResolvedValueOnce({ ok: true, status: 200 });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await technicianVerificationApi.uploadToSignedUrl(
        'https://storage.example/upload?token=xyz',
        'image/jpeg',
        { uri: 'file:///tmp/photo.jpg' },
      );

      expect(fetchMock).toHaveBeenNthCalledWith(1, 'file:///tmp/photo.jpg');
      expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://storage.example/upload?token=xyz', {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
    });

    it('throws with the status code when the storage provider rejects the upload', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce({ blob: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: false, status: 403 }) as unknown as typeof fetch;

      await expect(
        technicianVerificationApi.uploadToSignedUrl('https://storage.example/upload', 'image/jpeg', {
          uri: 'file:///tmp/photo.jpg',
        }),
      ).rejects.toThrow('403');
    });
  });

  describe('submit', () => {
    it('posts the documents array and returns the created verification', async () => {
      mockedClient.post.mockResolvedValue({
        data: {
          data: {
            id: 'v1',
            status: 'pending',
            submittedAt: '2026-01-01T00:00:00.000Z',
            rejectionReason: null,
            documents: [],
          },
        },
      });

      const documents = [
        {
          documentType: 'citizen_id_front' as const,
          storageObjectPath: 'kyc/tech-1/a.jpg',
          fileName: 'front.jpg',
          fileSize: 1000,
          mimeType: 'image/jpeg' as const,
        },
      ];

      const result = await technicianVerificationApi.submit(documents);

      expect(mockedClient.post).toHaveBeenCalledWith('/technicians/me/verification', {
        documents,
      });
      expect(result.status).toBe('PENDING');
    });
  });
});
