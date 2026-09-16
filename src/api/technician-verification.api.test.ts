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
    let xhrMock: {
      open: jest.Mock;
      setRequestHeader: jest.Mock;
      send: jest.Mock;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      status: number;
    };

    beforeEach(() => {
      xhrMock = {
        open: jest.fn(),
        setRequestHeader: jest.fn(),
        send: jest.fn(),
        onload: null,
        onerror: null,
        status: 200,
      };
      (globalThis as Record<string, unknown>).XMLHttpRequest = jest.fn(() => xhrMock);
    });

    afterEach(() => {
      delete (globalThis as Record<string, unknown>).XMLHttpRequest;
    });

    it('reads the local file and PUTs its bytes with the given mimeType', async () => {
      xhrMock.send.mockImplementation(() => {
        xhrMock.status = 200;
        xhrMock.onload?.();
      });

      await technicianVerificationApi.uploadToSignedUrl(
        'https://storage.example/upload?token=xyz',
        'image/jpeg',
        { uri: 'file:///tmp/photo.jpg' },
      );

      expect(xhrMock.open).toHaveBeenCalledWith('PUT', 'https://storage.example/upload?token=xyz', true);
      expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(xhrMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ uri: 'file:///tmp/photo.jpg', type: 'image/jpeg' }),
      );
    });

    it('throws with the status code when the storage provider rejects the upload', async () => {
      xhrMock.send.mockImplementation(() => {
        xhrMock.status = 403;
        xhrMock.onload?.();
      });

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
