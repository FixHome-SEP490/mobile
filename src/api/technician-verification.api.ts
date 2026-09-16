// src/api/technician-verification.api.ts
import apiClient from './client';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type KycDocumentType = 'citizen_id_front' | 'citizen_id_back' | 'face_photo';
export type KycMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface MyVerificationDocument {
  documentType: string;
  fileName: string;
}

export interface MyVerification {
  id: string;
  status: VerificationStatus;
  submittedAt: string;
  rejectionReason: string | null;
  documents: MyVerificationDocument[];
}

export interface KycUploadSlot {
  storageObjectPath: string;
  uploadUrl: string;
  token: string;
}

export interface SubmitDocumentPayload {
  documentType: KycDocumentType;
  storageObjectPath: string;
  fileName: string;
  fileSize: number;
  mimeType: KycMimeType;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStatus(value: unknown): VerificationStatus {
  switch (String(value ?? '').toUpperCase()) {
    case 'PENDING':
      return 'PENDING';
    case 'APPROVED':
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
      return 'REJECTED';
    default:
      throw new Error('Backend returned an unsupported verification status.');
  }
}

function normalizeDocument(payload: unknown): MyVerificationDocument {
  const document = isRecord(payload) ? payload : {};
  return {
    documentType: String(document.documentType ?? 'other'),
    fileName: String(document.fileName ?? ''),
  };
}

function normalizeVerification(payload: unknown): MyVerification {
  const verification = isRecord(payload) ? payload : {};
  return {
    id: String(verification.id ?? ''),
    status: normalizeStatus(verification.status),
    submittedAt: String(verification.submittedAt ?? ''),
    rejectionReason:
      verification.rejectionReason == null ? null : String(verification.rejectionReason),
    documents: Array.isArray(verification.documents)
      ? verification.documents.map(normalizeDocument)
      : [],
  };
}

export const technicianVerificationApi = {
  async getMyVerification(): Promise<MyVerification | null> {
    const res = await apiClient.get<{ data: unknown } | unknown>('/technicians/me/verification');
    const data = unwrap(res.data as { data: unknown });
    return data == null ? null : normalizeVerification(data);
  },

  async requestUploadUrl(mimeType: KycMimeType): Promise<KycUploadSlot> {
    const res = await apiClient.post<{ data: unknown } | unknown>(
      '/technicians/me/verification/documents/upload-url',
      { mimeType },
    );
    const slot = unwrap(res.data as { data: unknown });
    const record = isRecord(slot) ? slot : {};
    return {
      storageObjectPath: String(record.storageObjectPath ?? ''),
      uploadUrl: String(record.uploadUrl ?? ''),
      token: String(record.token ?? ''),
    };
  },

  /** Uploads raw bytes straight to Supabase Storage. Deliberately bypasses
   * apiClient: this is a different origin and must not carry our backend JWT.
   *
   * Uses XMLHttpRequest instead of fetch+blob because React Native's
   * fetch-blob polyfill produces empty/malformed bodies on iOS, causing 400s. */
  async uploadToSignedUrl(
    uploadUrl: string,
    mimeType: KycMimeType,
    file: { uri: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Tải ảnh lên thất bại (mã lỗi ${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error('Tải ảnh lên thất bại (lỗi mạng).'));
      xhr.send({ uri: file.uri, type: mimeType, name: 'upload' } as unknown as Blob);
    });
  },

  async submit(documents: SubmitDocumentPayload[]): Promise<MyVerification> {
    const res = await apiClient.post<{ data: unknown } | unknown>('/technicians/me/verification', {
      documents,
    });
    return normalizeVerification(unwrap(res.data as { data: unknown }));
  },
};
