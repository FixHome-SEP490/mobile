import apiClient from './client';
import {
  validateCustomerKycDocuments,
  type UploadedCustomerKycDocument,
} from '../features/customer-kyc/customer-kyc.validation';

export type CustomerKycStatus = 'none' | 'pending' | 'rejected' | 'verified';
export type CustomerKycMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type CustomerKycGender = 'MALE' | 'FEMALE' | 'OTHER';
export type CustomerKycDocumentType = 'citizen_id_front' | 'citizen_id_back';

export interface CustomerKycProfile {
  fullName: string;
  dateOfBirth: string | null;
  gender: CustomerKycGender | null;
  citizenIdNumber: string | null;
  address: string | null;
}

export interface CustomerVerificationState {
  status: CustomerKycStatus;
  rejectionReason: string | null;
  profile: CustomerKycProfile;
}

export interface CustomerKycUploadFile {
  uri: string;
  fileName: string;
  fileSize: number;
}

export interface CustomerKycSubmitPayload {
  fullName: string;
  dateOfBirth: string;
  gender: CustomerKycGender;
  citizenIdNumber: string;
  address: string;
  documents: UploadedCustomerKycDocument[];
}

interface UploadSlot {
  storageObjectPath: string;
  uploadUrl: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uploadTimeoutMs = 60_000;
const extensions: Record<CustomerKycMimeType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrap(value: unknown): unknown {
  const envelope = record(value);
  if (!envelope || envelope.success !== true || typeof envelope.statusCode !== 'number'
    || !Number.isInteger(envelope.statusCode) || envelope.statusCode < 200 || envelope.statusCode >= 300
    || typeof envelope.message !== 'string' || !('data' in envelope)) {
    throw new Error('Không thể xác định trạng thái xác minh.');
  }
  return envelope.data;
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`Dữ liệu xác minh ${field} chưa hợp lệ.`);
  return value;
}

function normalizeVerificationState(value: unknown): CustomerVerificationState {
  const state = record(value);
  const profile = record(state?.profile);
  const status = state?.status;
  if (!state || !profile || !['none', 'pending', 'rejected', 'verified'].includes(String(status))) {
    throw new Error('Trạng thái xác minh chưa được hỗ trợ.');
  }
  const gender = nullableString(profile.gender, 'giới tính');
  if (gender !== null && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
    throw new Error('Dữ liệu xác minh giới tính chưa hợp lệ.');
  }
  if (typeof profile.fullName !== 'string') throw new Error('Dữ liệu hồ sơ chưa hợp lệ.');
  return {
    status: status as CustomerKycStatus,
    rejectionReason: nullableString(state.rejectionReason, 'kết quả'),
    profile: {
      fullName: profile.fullName,
      dateOfBirth: nullableString(profile.dateOfBirth, 'ngày sinh'),
      gender: gender as CustomerKycGender | null,
      citizenIdNumber: nullableString(profile.citizenIdNumber, 'số CCCD'),
      address: nullableString(profile.address, 'địa chỉ'),
    },
  };
}

function extension(value: string): string | null {
  const leaf = value.split(/[\\/]/).pop() ?? '';
  return /\.([a-z0-9]+)$/i.exec(leaf)?.[1].toLowerCase() ?? null;
}

function safeUploadUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function normalizeUploadSlot(value: unknown, userId: string, mimeType: CustomerKycMimeType): UploadSlot {
  const slot = record(value);
  const path = slot?.storageObjectPath;
  const prefix = `kyc/${userId}/`;
  const pathName = typeof path === 'string' && path.startsWith(prefix) ? path.slice(prefix.length) : '';
  const pathExtension = extension(pathName);
  const uploadUrl = safeUploadUrl(slot?.uploadUrl);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId) || !/^[A-Za-z0-9_-]{1,128}\.(?:jpe?g|png|webp)$/i.test(pathName)
    || !pathExtension || !extensions[mimeType].includes(pathExtension) || !uploadUrl) {
    throw new Error('Backend returned an invalid private upload slot.');
  }
  return { storageObjectPath: path as string, uploadUrl };
}

class SignedUploadError extends Error {
  constructor(readonly status: number | null) {
    super('Không tải được ảnh CCCD lên kho bảo mật.');
    this.name = 'SignedUploadError';
  }
}

function uploadToSignedUrl(
  uploadUrl: string,
  mimeType: CustomerKycMimeType,
  file: CustomerKycUploadFile,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Đã hủy tải ảnh.'));
      return;
    }
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      xhr.abort();
      finish(new Error('Đã hủy tải ảnh.'));
    };
    try {
      xhr.open('PUT', uploadUrl, true);
      xhr.timeout = uploadTimeoutMs;
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? finish()
        : finish(new SignedUploadError(xhr.status));
      xhr.onerror = () => finish(new SignedUploadError(null));
      xhr.ontimeout = () => finish(new SignedUploadError(null));
      xhr.onabort = () => finish(new Error('Đã hủy tải ảnh.'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      xhr.send({ uri: file.uri, type: mimeType, name: file.fileName } as unknown as Blob);
    } catch {
      finish(new SignedUploadError(null));
    }
  });
}

function validUploadFile(file: CustomerKycUploadFile, mimeType: CustomerKycMimeType): boolean {
  if (!file || typeof file.fileName !== 'string' || !Object.prototype.hasOwnProperty.call(extensions, mimeType)) return false;
  const nameExtension = extension(file.fileName);
  return typeof file.uri === 'string' && /^(file|content):\/\//.test(file.uri)
    && /^[^\\/\u0000-\u001f]{1,255}$/.test(file.fileName)
    && !!nameExtension && extensions[mimeType].includes(nameExtension)
    && Number.isSafeInteger(file.fileSize) && file.fileSize >= 1 && file.fileSize <= MAX_FILE_SIZE;
}

export const customerVerificationApi = {
  async getMine(): Promise<CustomerVerificationState> {
    return normalizeVerificationState(unwrap((await apiClient.get('/customer/verification')).data));
  },

  async uploadDocument(input: {
    userId: string;
    documentType: CustomerKycDocumentType;
    mimeType: CustomerKycMimeType;
    file: CustomerKycUploadFile;
    reservedPaths?: readonly string[];
    signal?: AbortSignal;
  }): Promise<UploadedCustomerKycDocument> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.userId)
      || !['citizen_id_front', 'citizen_id_back'].includes(input.documentType)
      || !validUploadFile(input.file, input.mimeType)) {
      throw new Error('Ảnh CCCD cần đúng định dạng và có dung lượng từ 1 đến 10 MB.');
    }
    const getSlot = async () => {
      if (input.signal?.aborted) throw new Error('Đã hủy tải ảnh.');
      const slot = normalizeUploadSlot(
        unwrap((await apiClient.post('/customer/verification/upload-url', { mimeType: input.mimeType })).data),
        input.userId,
        input.mimeType,
      );
      if (input.reservedPaths?.includes(slot.storageObjectPath)) throw new Error('Mỗi mặt CCCD cần một đường dẫn tải riêng.');
      return slot;
    };
    let slot = await getSlot();
    try {
      await uploadToSignedUrl(slot.uploadUrl, input.mimeType, input.file, input.signal);
    } catch (error) {
      if (!(error instanceof SignedUploadError) || (error.status !== 401 && error.status !== 403)) throw error;
      slot = await getSlot();
      await uploadToSignedUrl(slot.uploadUrl, input.mimeType, input.file, input.signal);
    }
    return {
      documentType: input.documentType,
      storageObjectPath: slot.storageObjectPath,
      fileName: input.file.fileName,
      fileSize: input.file.fileSize,
      mimeType: input.mimeType,
    };
  },

  async submit(input: CustomerKycSubmitPayload, userId: string): Promise<CustomerVerificationState> {
    const documentError = validateCustomerKycDocuments(input.documents, userId);
    if (documentError) throw new Error(documentError);
    return normalizeVerificationState(unwrap(
      (await apiClient.post('/customer/verification', input)).data,
    ));
  },
};
