// src/api/part-requests.api.ts
import apiClient from './client';

export type PartRequestStatus =
  | 'requested'
  | 'ready'
  | 'delivering'
  | 'received'
  | 'completed'
  | 'cancelled';

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
  items: {
    partCatalogId: string;
    quantity: number;
    note?: string;
  }[];
  fulfillmentMethod?: FulfillmentMethod;
  reason?: string;
}

export interface ReceivePartRequestPayload {
  qrToken: string;
}

export interface UpdateItemUsagePayload {
  usageStatus: 'used' | 'returned';
}

const unwrap = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export const partRequestsApi = {
  async getByOrderId(orderId: string): Promise<PartRequest[]> {
    const res = await apiClient.get(`/service-orders/${orderId}/part-requests`);
    const data = unwrap<PartRequest[]>(res.data);
    return Array.isArray(data) ? data : [];
  },

  async createPreRepair(
    orderId: string,
    payload: CreatePartRequestPayload,
  ): Promise<PartRequest> {
    const res = await apiClient.post(
      `/service-orders/${orderId}/part-requests`,
      payload,
    );
    return unwrap<PartRequest>(res.data);
  },

  async receiveByQr(
    requestId: string,
    payload: ReceivePartRequestPayload,
  ): Promise<PartRequest> {
    const res = await apiClient.post(
      `/part-requests/${requestId}/receive`,
      payload,
    );
    return unwrap<PartRequest>(res.data);
  },

  async updateItemUsage(
    requestId: string,
    itemId: string,
    payload: UpdateItemUsagePayload,
  ): Promise<PartRequestItem> {
    const res = await apiClient.patch(
      `/part-requests/${requestId}/items/${itemId}/usage`,
      payload,
    );
    return unwrap<PartRequestItem>(res.data);
  },

  async cancel(requestId: string): Promise<PartRequest> {
    const res = await apiClient.patch(`/part-requests/${requestId}/cancel`);
    return unwrap<PartRequest>(res.data);
  },
};
