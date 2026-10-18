import { customerVerificationApi } from './customer-verification.api';
import apiClient from './client';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const mockedClient = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
const envelope = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'Success', data } });
const state = {
  status: 'none', rejectionReason: null, verification: null,
  profile: { fullName: 'Nguyễn Văn An', dateOfBirth: null, gender: null, citizenIdNumber: null, address: null },
};

function xhr(status = 200) {
  const request: { open: jest.Mock; setRequestHeader: jest.Mock; send: jest.Mock; abort: jest.Mock; onload: (() => void) | null; onerror: (() => void) | null; ontimeout: (() => void) | null; onabort: (() => void) | null; timeout: number; status: number } = {
    open: jest.fn(), setRequestHeader: jest.fn(), send: jest.fn(), abort: jest.fn(),
    onload: null, onerror: null, ontimeout: null, onabort: null, timeout: 0, status,
  };
  request.send.mockImplementation(() => request.onload?.());
  return request;
}

describe('customerVerificationApi', () => {
  afterEach(() => {
    jest.resetAllMocks();
    delete (globalThis as Record<string, unknown>).XMLHttpRequest;
  });

  it('normalizes the Backend envelope and accepts the none state', async () => {
    mockedClient.get.mockResolvedValue(envelope(state));
    await expect(customerVerificationApi.getMine()).resolves.toMatchObject({ status: 'none', profile: state.profile });
    expect(mockedClient.get).toHaveBeenCalledWith('/customer/verification');
  });

  it.each(['unknown', 'PENDING', null])('rejects unsupported or malformed status %s', async status => {
    mockedClient.get.mockResolvedValue(envelope({ ...state, status }));
    await expect(customerVerificationApi.getMine()).rejects.toThrow();
  });

  it('uploads through native XHR with only Content-Type, validates owner path, and returns metadata', async () => {
    const request = xhr();
    (globalThis as Record<string, unknown>).XMLHttpRequest = jest.fn(() => request);
    mockedClient.post.mockResolvedValue(envelope({
      storageObjectPath: 'kyc/customer-1/front.jpg',
      uploadUrl: 'https://storage.example.test/signed-upload?token=private',
      token: 'private',
    }));

    const result = await customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_front', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/front.jpg', fileName: 'cccd-mat-truoc.jpg', fileSize: 1024 },
    });

    expect(mockedClient.post).toHaveBeenCalledWith('/customer/verification/upload-url', { mimeType: 'image/jpeg' });
    expect(request.open).toHaveBeenCalledWith('PUT', 'https://storage.example.test/signed-upload?token=private', true);
    expect(request.setRequestHeader.mock.calls).toEqual([['Content-Type', 'image/jpeg']]);
    expect(request.timeout).toBeGreaterThan(0);
    expect(result).toEqual({
      documentType: 'citizen_id_front', storageObjectPath: 'kyc/customer-1/front.jpg',
      fileName: 'cccd-mat-truoc.jpg', fileSize: 1024, mimeType: 'image/jpeg',
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('requests one fresh signed URL after an explicit 403, then stops', async () => {
    const rejected = xhr(403);
    const accepted = xhr(201);
    const requests = [rejected, accepted];
    (globalThis as Record<string, unknown>).XMLHttpRequest = jest.fn(() => requests.shift());
    mockedClient.post
      .mockResolvedValueOnce(envelope({ storageObjectPath: 'kyc/customer-1/expired.jpg', uploadUrl: 'https://storage.example.test/old', token: 'old' }))
      .mockResolvedValueOnce(envelope({ storageObjectPath: 'kyc/customer-1/fresh.jpg', uploadUrl: 'https://storage.example.test/new', token: 'new' }));

    const result = await customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_back', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/back.jpg', fileName: 'cccd-mat-sau.jpg', fileSize: 2048 },
    });

    expect(mockedClient.post).toHaveBeenCalledTimes(2);
    expect(result.storageObjectPath).toBe('kyc/customer-1/fresh.jpg');
    expect(JSON.stringify(result)).not.toMatch(/old|new|signed|token/);
  });

  it('does not overwrite a path reserved by the other CCCD side', async () => {
    const request = xhr();
    (globalThis as Record<string, unknown>).XMLHttpRequest = jest.fn(() => request);
    mockedClient.post.mockResolvedValue(envelope({
      storageObjectPath: 'kyc/customer-1/front.jpg', uploadUrl: 'https://storage.example.test/signed-upload',
    }));
    await expect(customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_back', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/back.jpg', fileName: 'back.jpg', fileSize: 1024 },
      reservedPaths: ['kyc/customer-1/front.jpg'],
    })).rejects.toThrow('đường dẫn tải riêng');
    expect(request.send).not.toHaveBeenCalled();
  });

  it('does not request a new signed URL after a timeout', async () => {
    const request = xhr();
    request.send.mockImplementation(() => request.ontimeout?.());
    (globalThis as Record<string, unknown>).XMLHttpRequest = jest.fn(() => request);
    mockedClient.post.mockResolvedValue(envelope({
      storageObjectPath: 'kyc/customer-1/front.jpg', uploadUrl: 'https://storage.example.test/signed-upload',
    }));
    await expect(customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_front', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/front.jpg', fileName: 'front.jpg', fileSize: 1024 },
    })).rejects.toThrow();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
  });

  it('rejects owner, MIME/extension, and size mismatches before uploading', async () => {
    mockedClient.post.mockResolvedValue(envelope({ storageObjectPath: 'kyc/other/front.jpg', uploadUrl: 'https://storage.example.test/upload' }));
    await expect(customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_front', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/front.jpg', fileName: 'front.jpg', fileSize: 1024 },
    })).rejects.toThrow();
    await expect(customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_front', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/front.png', fileName: 'front.png', fileSize: 1024 },
    })).rejects.toThrow();
    await expect(customerVerificationApi.uploadDocument({
      userId: 'customer-1', documentType: 'citizen_id_front', mimeType: 'image/jpeg',
      file: { uri: 'file:///local/front.jpg', fileName: 'front.jpg', fileSize: 10 * 1024 * 1024 + 1 },
    })).rejects.toThrow();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
  });

  it('posts exactly the form and two document records and normalizes pending status', async () => {
    mockedClient.post.mockResolvedValue(envelope({ ...state, status: 'pending' }));
    const submission = {
      fullName: 'Nguyễn Văn An', dateOfBirth: '1995-06-15', gender: 'MALE' as const,
      citizenIdNumber: '079123456789', address: '12 Nguyễn Trãi, Quận 1', documents: [
        { documentType: 'citizen_id_front' as const, storageObjectPath: 'kyc/customer-1/front.jpg', fileName: 'front.jpg', fileSize: 1024, mimeType: 'image/jpeg' as const },
        { documentType: 'citizen_id_back' as const, storageObjectPath: 'kyc/customer-1/back.jpg', fileName: 'back.jpg', fileSize: 1024, mimeType: 'image/jpeg' as const },
      ],
    };
    await expect(customerVerificationApi.submit(submission, 'customer-1')).resolves.toMatchObject({ status: 'pending' });
    expect(mockedClient.post).toHaveBeenCalledWith('/customer/verification', submission);
  });
});
