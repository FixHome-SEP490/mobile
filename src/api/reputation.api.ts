import apiClient from './client';

/** One change of a score: a violation, a staff adjustment or the periodic reset. */
export interface ReputationEvent {
  id: string;
  kind: 'violation' | 'adjustment' | 'reset';
  delta: number;
  pointsAfter: number;
  reason: string;
  penalty: string | null;
  createdAt: string;
}

/** Own score (GET /reputation/me), same contract as the web profile card. */
export interface MyReputation {
  points: number;
  resetsAt: string | null;
  suspendedUntil: string | null;
  locked: boolean;
  events: ReputationEvent[];
}

export const reputationApi = {
  async mine(): Promise<MyReputation> {
    const res = await apiClient.get('/reputation/me');
    const d = (res.data && typeof res.data === 'object' && 'data' in res.data ? res.data.data : res.data) as Partial<MyReputation> | null;
    const points = Number(d?.points);
    if (!d || !Number.isFinite(points)) throw new Error('Invalid reputation response');
    return {
      points,
      resetsAt: d.resetsAt ?? null,
      suspendedUntil: d.suspendedUntil ?? null,
      locked: d.locked === true,
      events: Array.isArray(d.events) ? d.events.map((e) => ({ ...e, penalty: e.penalty ?? null })) : [],
    };
  },
};
