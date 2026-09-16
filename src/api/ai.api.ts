// src/api/ai.api.ts
import apiClient from './client';

export interface DiagnosisRequest {
  description: string;
  imageUrl?: string;
  categoryHint?: string;
  bookingId?: string;
  images?: string[];
}

export interface DiagnosisResult {
  id?: string;
  estimatedCostRange?: {
    min: number;
    max: number;
  };
  possibleCauses?: string[];
  recommendedServices?: string[];
  confidence?: number;
  advice?: string;
  disclaimer?: string;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const aiApi = {
  async analyze(data: DiagnosisRequest): Promise<DiagnosisResult> {
    const res = await apiClient.post<{ data: DiagnosisResult } | DiagnosisResult>(
      '/ai/diagnoses',
      data,
    );
    return unwrap(res.data);
  },

  async getDiagnosis(id: string): Promise<DiagnosisResult> {
    const res = await apiClient.get<{ data: DiagnosisResult } | DiagnosisResult>(
      `/ai/diagnoses/${id}`,
    );
    return unwrap(res.data);
  },
};
