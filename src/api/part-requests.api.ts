// src/api/part-requests.api.ts
import apiClient from './client';

export type PartRequestStatus = 'requested' | 'ready' | 'delivering' | 'received' | 'completed' | 'cancelled';
export type PartRequestType = 'pre_repair' | 'additional';
export type FulfillmentMethod = 'pickup' | 'delivery';
export type PartUsageStatus = 'pending' | 'used' | 'returned';
export type PartSource = 'fixhome' | 'technician' | 'external';

export interface PartRequestItem {
  id: string;
  partRequestId: string;
  partCatalogId?: string | null;
  partSource: PartSource;
  partNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  usageStatus: PartUsageStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartRequest {
  id: string;
  serviceOrderId: string;
  technicianId: string;
  requestType: PartRequestType;
  fulfillmentMethod: FulfillmentMethod;
  status: PartRequestStatus;
  reason?: string | null;
  shippingFee: number;
  additionalCostId?: string | null;
  qrToken?: string | null;
  qrGeneratedAt?: string | null;
  receivedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  preparedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PartRequestItem[];
}

export interface CreatePartRequestPayload {
  items: { partCatalogId: string; quantity: number; note?: string }[];
  fulfillmentMethod?: FulfillmentMethod;
  reason?: string;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const partRequestsApi = {
  async createPreRepair(orderId: string, payload: CreatePartRequestPayload): Promise<PartRequest> {
    const res = await apiClient.post<{ data: PartRequest } | PartRequest>(
      `/service-orders/${orderId}/part-requests`,
      payload,
    );
    return unwrap(res.data);
  },

  async getByOrderId(orderId: string): Promise<PartRequest[]> {
    const res = await apiClient.get<{ data: PartRequest[] } | PartRequest[]>(
      `/service-orders/${orderId}/part-requests`,
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async receiveByQr(requestId: string, qrToken: string): Promise<PartRequest> {
    const res = await apiClient.post<{ data: PartRequest } | PartRequest>(
      `/part-requests/${requestId}/receive`,
      { qrToken },
    );
    return unwrap(res.data);
  },

  async updateItemUsage(requestId: string, itemId: string, usageStatus: 'used' | 'returned'): Promise<PartRequestItem> {
    const res = await apiClient.patch<{ data: PartRequestItem } | PartRequestItem>(
      `/part-requests/${requestId}/items/${itemId}/usage`,
      { usageStatus },
    );
    return unwrap(res.data);
  },

  async cancel(requestId: string, reason?: string): Promise<PartRequest> {
    const res = await apiClient.patch<{ data: PartRequest } | PartRequest>(
      `/part-requests/${requestId}/cancel`,
      { reason },
    );
    return unwrap(res.data);
  },
};
