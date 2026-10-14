// src/types/api.types.ts
export interface ApiResponse<T> {
  success?: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

/** Latest Backend envelope; legacy error shape remains available below for existing callers. */
export interface BackendApiError {
  success: false;
  statusCode: number;
  error: { code: string; message: string; details?: unknown };
  timestamp?: string;
  path?: string;
}
export type EvidenceWireType = 'before' | 'after' | 'additional' | 'checkin_face';
export const additionalCostWireStatuses = ['pending_approval', 'approved', 'rejected', 'expired', 'cancelled'] as const;
export type AdditionalCostWireStatus = typeof additionalCostWireStatuses[number];
export interface CheckInDto {
  lat: number;
  lng: number;
  accuracyMeters: number;
  deviceInfo?: Record<string, unknown>;
}
export interface UpdateLocationDto {
  lat: number;
  lng: number;
  accuracyMeters?: number;
}
export interface EvidenceUploadMetadata { note?: string; capturedAt?: string }
export interface CompletionRequestDto { completionNote?: string }
export interface FinancialDecisionDto { action: 'APPROVE' | 'REJECT'; paidWarrantyItemIds?: string[] }
export interface OrderStatusHistoryResponse {
  id: string;
  serviceOrderId: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId: string | null;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  errors?: {
    field: string;
    message: string;
  }[];
}
