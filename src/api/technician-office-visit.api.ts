// Hẹn lên trụ sở sau khi admin xác nhận danh tính (PO 09/11/2026). Bám theo backend `technicians/me/office-visit`.
import apiClient from './client';

export interface OfficeSlot {
  /** ISO, đầu lượt hẹn. */
  startsAt: string;
  remaining: number;
}

export interface VisitOfficeOption {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Null khi chưa biết vị trí của thợ hoặc trụ sở. */
  distanceKm: number | null;
  /** Trụ sở gần nhất. */
  recommended: boolean;
  slots: OfficeSlot[];
}

export interface CurrentOfficeVisit {
  id: string;
  officeId: string;
  officeName: string;
  officeAddress: string;
  officePhone: string | null;
  scheduledAt: string;
  status: string;
}

export interface MyOfficeVisit {
  canBook: boolean;
  blocked: boolean;
  missedVisits: number;
  maxMissedVisits: number;
  supportPhone: string | null;
  current: CurrentOfficeVisit | null;
  offices: VisitOfficeOption[];
}

type Wrapped<T> = { data: T } | T;
const unwrap = <T>(body: Wrapped<T>): T => ((body as { data?: T })?.data !== undefined ? (body as { data: T }).data : (body as T));

export const technicianOfficeVisitApi = {
  async getMine(): Promise<MyOfficeVisit> {
    return unwrap((await apiClient.get<Wrapped<MyOfficeVisit>>('/technicians/me/office-visit')).data);
  },
  async book(officeId: string, scheduledAt: string): Promise<CurrentOfficeVisit> {
    return unwrap((await apiClient.post<Wrapped<CurrentOfficeVisit>>('/technicians/me/office-visit', { officeId, scheduledAt })).data);
  },
};
