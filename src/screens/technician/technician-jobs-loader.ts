import type { OrdersPage, ServiceOrderItem } from '../../api/orders.api';
import { UserRole, type UserInfo } from '../../types/auth.types';

export function technicianJobsUserId(session: { isAuthenticated: boolean; user: UserInfo | null }): string | null {
  return session.isAuthenticated && session.user?.role === UserRole.TECHNICIAN
    ? session.user.id : null;
}
interface JobsSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}
export interface JobsState {
  jobs: ServiceOrderItem[];
  jobsTotal: number;
  jobsPage: number;
  loading: boolean;
  refreshing: boolean;
  loadingMoreJobs: boolean;
  error: string | null;
  actionLoading: string | null;
  blockedOrderIds: string[];
}
export const initialJobsState: JobsState = {
  jobs: [], jobsTotal: 0, jobsPage: 0,
  loading: true, refreshing: false, loadingMoreJobs: false,
  error: null, actionLoading: null, blockedOrderIds: [],
};
const deniedMessage = 'Không có quyền xem công việc. Vui lòng kiểm tra đăng nhập.';
function accessDenied(error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}
// Same-process duplicate guard, scoped by technician User ID. Never replay an ambiguous
// POST on refresh/remount/login. Contains IDs only; not durable across app restart/devices.
const submittedEnRoutes = new Map<string, Set<string>>();
function submissions(userId: string) {
  let ids = submittedEnRoutes.get(userId);
  if (!ids) { ids = new Set(); submittedEnRoutes.set(userId, ids); }
  return ids;
}

export const JOBS_PAGE_SIZE = 20;

function dedupeJobs(existing: ServiceOrderItem[], incoming: ServiceOrderItem[]): ServiceOrderItem[] {
  const seen = new Set(existing.map((job) => job.id));
  const merged = [...existing];
  for (const job of incoming) {
    if (!seen.has(job.id)) { seen.add(job.id); merged.push(job); }
  }
  return merged;
}

/**
 * Merge one fetched jobs page. An empty page clamps the total to what is actually
 * loaded so inconsistent metadata can never promise infinite further pages.
 */
function mergeJobsPage(existing: ServiceOrderItem[], rows: ServiceOrderItem[], total: number, page: number): {
  jobs: ServiceOrderItem[]; jobsTotal: number; jobsPage: number;
} {
  const jobs = dedupeJobs(existing, rows);
  return {
    jobs,
    jobsTotal: rows.length === 0 ? jobs.length : total,
    jobsPage: page,
  };
}

export interface JobsLoaderOptions {
  pageSize?: number;
  getOrdersPage?: (page: number, pageSize: number) => Promise<OrdersPage>;
}

export function createJobsLoader(
  getOrders: () => Promise<ServiceOrderItem[]>, write: (state: JobsState) => void,
  enRoute: (id: string) => Promise<unknown>, session: JobsSession,
  notify: (title: string, message: string) => void,
  options: JobsLoaderOptions = {},
) {
  const pageSize = options.pageSize ?? JOBS_PAGE_SIZE;
  const getOrdersPage = options.getOrdersPage;
  let state = initialJobsState;
  let active = false;
  let ownerId: string | null = null;
  let focusGeneration = 0;
  let requestGeneration = 0;
  let loaded = false;
  let inFlight: Promise<void> | null = null;
  let unsubscribe: (() => void) | undefined;
  const authorized = () => ownerId !== null && session.getUserId() === ownerId;
  const publish = (patch: Partial<JobsState>) => {
    state = { ...state, ...patch };
    if (active) write(state);
  };
  function invalidate() { ++requestGeneration; inFlight = null; }
  function denyAccess() {
    invalidate();
    loaded = false;
    publish({ ...initialJobsState, loading: false, error: deniedMessage });
  }
  function refresh(force = false): Promise<void> {
    if (!active || !authorized()) return Promise.resolve();
    if (inFlight && !force) return inFlight;
    const generation = ++requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loading: !loaded, refreshing: loaded, loadingMoreJobs: false, error: null, blockedOrderIds: [...submissions(ownerId!)] });
    const request = (async () => {
      try {
        const outcome = getOrdersPage
          ? await getOrdersPage(1, pageSize).then(
            (page) => ({ ok: true as const, rows: page.data, total: page.total }),
            (error: unknown) => ({ ok: false as const, error }),
          )
          : await getOrders().then(
            (rows) => ({ ok: true as const, rows, total: rows.length }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        if (!valid()) return;
        if (!outcome.ok) {
          if (accessDenied(outcome.error)) { denyAccess(); return; }
          publish({ error: 'Không thể tải công việc. Vui lòng thử lại.' });
          return;
        }
        loaded = true;
        const merged = mergeJobsPage([], outcome.rows, outcome.total, 1);
        publish({ jobs: merged.jobs, jobsTotal: merged.jobsTotal, jobsPage: merged.jobsPage, error: null });
      } catch (error) {
        if (!valid()) return;
        if (accessDenied(error)) denyAccess();
        else publish({ error: 'Không thể tải công việc. Vui lòng thử lại.' });
      } finally {
        if (valid()) publish({ loading: false, refreshing: false });
      }
    })();
    inFlight = request;
    void request.then(() => { if (valid()) inFlight = null; });
    return request;
  }
  function loadMoreJobs(): Promise<void> {
    if (!active || !authorized() || !getOrdersPage) return Promise.resolve();
    if (state.loading || state.refreshing || state.loadingMoreJobs) return Promise.resolve();
    if (state.jobs.length >= state.jobsTotal) return Promise.resolve();
    const nextPage = state.jobsPage + 1;
    const generation = requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loadingMoreJobs: true });
    return (async () => {
      try {
        const result = await getOrdersPage(nextPage, pageSize);
        if (!valid()) return;
        const merged = mergeJobsPage(state.jobs, result.data, result.total, nextPage);
        publish({ jobs: merged.jobs, jobsTotal: merged.jobsTotal, jobsPage: merged.jobsPage, error: null });
      } catch (error) {
        if (!valid()) return;
        if (accessDenied(error)) { denyAccess(); return; }
        publish({ error: 'Không thể tải thêm công việc. Danh sách đã tải được giữ lại; hãy thử lại.' });
      } finally {
        if (valid()) publish({ loadingMoreJobs: false });
      }
    })();
  }
  function blur() {
    active = false;
    ++focusGeneration;
    invalidate();
    unsubscribe?.();
    unsubscribe = undefined;
  }
  function captureFocus() {
    const generation = focusGeneration;
    return () => active && authorized() && generation === focusGeneration;
  }
  async function handleEnRoute(id: string) {
    if (!active || !authorized() || state.actionLoading) return;
    const userId = ownerId!;
    const ids = submissions(userId);
    if (ids.has(id) || !state.jobs.some(job => job.id === id && job.status === 'ACCEPTED' && !job.historical)) return;
    ids.add(id); // Synchronous lock before API/await; no retry on unknown outcome.
    const isCurrent = captureFocus();
    const sameAccount = () => ownerId === userId && session.getUserId() === userId;
    publish({ actionLoading: id, blockedOrderIds: [...ids] });
    try {
      await enRoute(id);
      if (!sameAccount()) return;
      // Data freshness belongs to the account, not the original focus generation.
      invalidate();
      if (isCurrent()) notify('Thành công', 'Đã cập nhật trạng thái: Đang di chuyển đến nhà khách hàng.');
      await refresh(true); // While blurred this is deferred to the next focus GET.
    } catch (error) {
      if (!sameAccount()) return;
      if (accessDenied(error)) denyAccess(); // Also invalidates GETs started before this rejection.
      else {
        if (isCurrent()) notify('Chưa xác nhận trạng thái', 'Không rõ yêu cầu đã được xử lý hay chưa. Vui lòng làm mới; không gửi lại thao tác.');
        await refresh(true); // GET reconciliation only, never another POST.
      }
    } finally {
      if (sameAccount()) publish({ actionLoading: null });
    }
  }
  return {
    refresh, blur, captureFocus, handleEnRoute, loadMoreJobs,
    focus() {
      blur();
      const nextOwner = session.getUserId();
      if (nextOwner !== ownerId) { state = initialJobsState; loaded = false; }
      ownerId = nextOwner;
      active = true;
      publish({ actionLoading: null });
      unsubscribe = session.subscribe(() => {
        if (session.getUserId() === ownerId) return;
        ++focusGeneration;
        ownerId = null;
        denyAccess();
      });
      if (!authorized()) { denyAccess(); return Promise.resolve(); }
      return refresh();
    },
  };
}
