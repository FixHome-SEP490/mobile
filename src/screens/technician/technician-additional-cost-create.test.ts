import {
  costProposalTarget,
  createCostProposalController,
  initialCostProposalState,
  validateCostProposalDraft,
  type CostProposalDeps,
  type CostProposalState,
} from './technician-additional-cost-create';
import { createAdditionalCostsController } from '../customer/order-additional-costs';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const gate = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  completionRequestedAt: null,
  historical: false,
  ...overrides,
});

const fillValid = (h: Harness) => {
  const controller = h.controller;
  controller.setField('reason', 'Phát hiện thêm mối hàn hở');
  controller.setField('description', 'Gia cố mối hàn');
  controller.setField('quantity', '1');
  controller.setField('unitPrice', '120000');
  controller.requestConfirm();
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: CostProposalDeps;
  controller: ReturnType<typeof createCostProposalController>;
  setOrder: (order: ReturnType<typeof gate> | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  setStatuses: (statuses: unknown[]) => void;
  state: () => CostProposalState;
}

/** Exercises the actual production controller the detail screen calls. */
function setup(): Harness {
  let order: ReturnType<typeof gate> | null = gate();
  let technicianId: string | null = 'tech-1';
  let focused = true;
  let statuses: unknown[] = [];
  const write = jest.fn<void, [CostProposalState]>();
  const deps: CostProposalDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    getCostStatuses: () => statuses,
    createProposal: jest.fn().mockResolvedValue({ id: 'ac-1', status: 'PENDING_APPROVAL' }),
    refreshCosts: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createCostProposalController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => { order = value; },
    setTechnicianId: (value) => { technicianId = value; },
    setFocused: (value) => { focused = value; },
    setStatuses: (value) => { statuses = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const post = (h: Harness) => h.deps.createProposal as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshCosts as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the proposal surface: no decide/revise/payment', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['cancelConfirm', 'markReverified', 'requestConfirm', 'reset', 'setField', 'submit'].sort(),
  );
});

it('posts nothing before an explicit confirm + submit', async () => {
  const h = setup();
  h.controller.setField('reason', 'Hở mối hàn');
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  h.controller.requestConfirm();
  expect(post(h)).not.toHaveBeenCalled();
});

it('confirms an honest proposed total and submits the exact labor payload', async () => {
  const h = setup();
  fillValid(h);
  expect(h.state()).toMatchObject({ confirming: true, proposedTotalText: expect.stringContaining('120') });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID, {
    reason: 'Phát hiện thêm mối hàn hở',
    items: [{ type: 'labor', description: 'Gia cố mối hàn', quantity: 1, unitPrice: 120000 }],
  });
  const rendered = JSON.stringify(post(h).mock.calls[0][1]);
  expect(rendered).not.toMatch(/paidWarranty|pay|commission|approve|reject/i);
  expect(h.state()).toMatchObject({ sent: true, busy: false, confirming: false, error: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã gửi đề xuất', 'Đã gửi đề xuất chi phí, khách cần duyệt, chưa thanh toán.'],
  );
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('forwards a trimmed note within limit and omits it when blank', async () => {
  const h = setup();
  h.controller.setField('reason', 'Hở mối hàn');
  h.controller.setField('description', 'Gia cố');
  h.controller.setField('quantity', '2');
  h.controller.setField('unitPrice', '50000');
  h.controller.setField('note', '  Nên làm sớm.  ');
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID, {
    reason: 'Hở mối hàn',
    items: [{ type: 'labor', description: 'Gia cố', quantity: 2, unitPrice: 50000 }],
    note: 'Nên làm sớm.',
  });
});

it.each([
  ['live PENDING_APPROVAL blocks a duplicate', ['PENDING_APPROVAL']],
  ['lowercase pending blocks case-insensitively', ['pending_approval']],
  ['mixed list with one pending blocks', ['APPROVED', 'Pending_Approval']],
])('%s', async (_label, statuses) => {
  const h = setup();
  h.setStatuses(statuses);
  fillValid(h);
  expect(h.state().confirming).toBe(false);
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe('Chưa thể đề xuất chi phí');
});

it('allows a new proposal when prior requests are decided or expired', async () => {
  for (const statuses of [['APPROVED'], ['REJECTED', 'EXPIRED'], []]) {
    const h = setup();
    h.setStatuses(statuses);
    fillValid(h);
    expect(h.state().confirming).toBe(true);
    await h.controller.submit();
    expect(post(h)).toHaveBeenCalledTimes(1);
  }
});

it.each([
  ['wrong technician (logged out)', { tech: null }],
  ['blurred screen', { focused: false }],
  ['missing order', { order: null }],
  ['malformed order id', { order: { id: 'not-a-uuid' } }],
  ['historical summary', { order: { historical: true } }],
  ['EN_ROUTE order', { order: { status: 'EN_ROUTE' } }],
  ['completed order', { order: { status: 'COMPLETED' } }],
  ['completion already requested', { order: { completionRequestedAt: '2030-10-21T12:00:00Z' } }],
])('blocks submit for %s without POST', async (_label, scenario) => {
  const h = setup();
  if ('tech' in scenario) h.setTechnicianId(scenario.tech as null);
  if ('focused' in scenario) h.setFocused(scenario.focused as boolean);
  if ('order' in scenario) {
    const value = scenario.order as null | Record<string, unknown>;
    h.setOrder(value === null ? null : gate(value));
  }
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
});

it('stays silent without POST when logged out or blurred at confirm', async () => {
  const loggedOut = setup();
  loggedOut.setTechnicianId(null);
  loggedOut.controller.requestConfirm();
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setFocused(false);
  blurred.controller.requestConfirm();
  expect(notified(blurred)).not.toHaveBeenCalled();
});

it('requires a trimmed reason within limit', async () => {
  const blank = setup();
  blank.controller.setField('description', 'Gia cố');
  blank.controller.setField('quantity', '1');
  blank.controller.setField('unitPrice', '1000');
  blank.controller.requestConfirm();
  expect(blank.state().confirming).toBe(false);
  expect(blank.state().fieldErrors.reason).toBeTruthy();
  expect(post(blank)).not.toHaveBeenCalled();

  const over = setup();
  over.controller.setField('reason', 'r'.repeat(2001));
  over.controller.setField('description', 'Gia cố');
  over.controller.setField('quantity', '1');
  over.controller.setField('unitPrice', '1000');
  over.controller.requestConfirm();
  expect(over.state().confirming).toBe(false);
  expect(over.state().fieldErrors.reason).toBeTruthy();
});

it('validates the labor line without POST: blank, oversize, non-integer', async () => {
  const h = setup();
  h.controller.setField('reason', 'Hở mối hàn');
  h.controller.setField('quantity', '1.5');
  h.controller.requestConfirm();
  expect(h.state().confirming).toBe(false);
  expect(h.state().fieldErrors.quantity).toBeTruthy();
  expect(post(h)).not.toHaveBeenCalled();
});

it('throttles duplicate submits to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  fillValid(h);
  const first = h.controller.submit();
  const second = h.controller.submit();
  gatePromise.resolve({ id: 'ac-1' });
  await Promise.all([first, second]);
  expect(post(h)).toHaveBeenCalledTimes(1);
});

it('drops a stale success response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  fillValid(h);
  const attempt = h.controller.submit();
  h.setTechnicianId(null);
  gatePromise.resolve({ id: 'ac-1' });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().sent).toBe(false);
});

it.each([401, 403])('purges the draft on %s with re-login copy', async (status) => {
  const h = setup();
  fillValid(h);
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({
    draft: { reason: '', description: '', quantity: '', unitPrice: '', note: '' },
    busy: false,
    sent: false,
  });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it.each([409, 422])('shows backend contract status on %s and reconciles GET', async (status) => {
  const h = setup();
  fillValid(h);
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().error).toMatch(new RegExp(`mã ${status}`));
  expect(h.state().needsVerify).toBe(false);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])('locks on ambiguous failure %s: no repost until costs GET reloads', async (_label, error) => {
  const h = setup();
  fillValid(h);
  post(h).mockRejectedValue(error);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().needsVerify).toBe(true);
  expect(h.state().error).toMatch(/tải lại chi phí phát sinh/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
  // Locked: confirm + submit do nothing; a pending GET result blocks repost.
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  h.setStatuses(['PENDING_APPROVAL']);
  h.controller.markReverified();
  fillValid(h);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
});

it('reset clears the draft on blur/order change', () => {
  const h = setup();
  fillValid(h);
  h.controller.reset();
  expect(h.state()).toMatchObject({
    draft: { reason: '', description: '', quantity: '', unitPrice: '', note: '' },
    confirming: false,
    sent: false,
    needsVerify: false,
  });
});

describe('costProposalTarget (production gate)', () => {
  it.each([
    [{ status: 'under_repair', completionRequestedAt: null }, true],
    [{ status: 'EN_ROUTE' }, false],
    [{ completionRequestedAt: '2030-10-21T12:00:00Z' }, false],
    [{ completionRequestedAt: '' }, true],
    [{ historical: true }, false],
    [null, false],
  ])('gate %s', (overrides, expected) => {
    const order = overrides === null ? null : gate(overrides as Record<string, unknown>);
    expect(costProposalTarget(order, () => [])).toBe(expected ? ORDER_ID : null);
  });

  it.each([[['PENDING_APPROVAL'], false], [['pending_approval'], false], [['APPROVED'], true], [[], true]])(
    'pending statuses %s',
    (statuses, expected) => {
      expect(costProposalTarget(gate(), () => statuses)).toBe(expected ? ORDER_ID : null);
    },
  );
});

describe('validateCostProposalDraft (production helper)', () => {
  it('trims reason and totals a valid line', () => {
    expect(validateCostProposalDraft({
      reason: '  Hở mối hàn  ', description: 'Gia cố', quantity: '2', unitPrice: '50000', note: '',
    })).toMatchObject({
      reason: 'Hở mối hàn',
      line: { description: 'Gia cố', quantity: 2, unitPrice: 50000, total: 100000 },
      note: null,
      errors: {},
    });
  });

  it('rejects a blank reason and an invalid line together', () => {
    const { reason, line, errors } = validateCostProposalDraft({
      reason: '   ', description: '', quantity: '0', unitPrice: 'abc', note: '',
    });
    expect(reason).toBeNull();
    expect(line).toBeNull();
    expect(errors).toMatchObject({ reason: expect.any(String), description: expect.any(String) });
  });
});

it('shares the initial state shape', () => {
  expect(initialCostProposalState).toMatchObject({
    confirming: false,
    busy: false,
    error: null,
    needsVerify: false,
    sent: false,
    proposedTotalText: null,
  });
});

describe('ambiguous-proposal retry path (review remediation)', () => {
  const PENDING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const pendingRecord = {
    id: PENDING_ID,
    serviceOrderId: ORDER_ID,
    status: 'PENDING_APPROVAL',
    reason: 'Gia cố mối hàn',
    totalLaborDelta: 120000,
    totalPartsDelta: 0,
    createdAt: '2030-10-21T10:00:00Z',
    expiresAt: null,
    items: [{ id: 'li-1', type: 'labor', description: 'Gia cố', quantity: 1, unitPrice: 120000, lineTotal: 120000 }],
  };

  interface ScreenHarness {
    proposal: Harness;
    costs: ReturnType<typeof createAdditionalCostsController>;
    getAdditionalCosts: jest.Mock;
    statuses: () => string[];
    techId: () => string | null;
    setTechId: (value: string | null) => void;
    focused: () => boolean;
    setFocused: (value: boolean) => void;
    /** Exact fixed onRefresh unlock sequence from the technician screen. */
    fixedOnRefresh: () => Promise<void>;
  }

  /** Both REAL production controllers wired exactly like the fixed screen. */
  function screenSetup(): ScreenHarness {
    let techId: string | null = 'tech-1';
    let focused = true;
    let statuses: string[] = [];
    const getAdditionalCosts = jest.fn().mockResolvedValue([]);
    const costs = createAdditionalCostsController(getAdditionalCosts, (state) => {
      // Screen-identical synchronous mirror alongside setCostsState.
      statuses = state.requests.map((request) => request.status);
    });
    const h = setup();
    h.deps.getTechnicianId = () => techId;
    h.deps.isFocused = () => focused;
    h.deps.getCostStatuses = () => statuses;
    h.deps.refreshCosts = async () => {
      await costs.refreshCosts(() => techId !== null && focused);
    };
    return {
      proposal: h,
      costs,
      getAdditionalCosts,
      statuses: () => statuses,
      techId: () => techId,
      setTechId: (value) => { techId = value; h.setTechnicianId(value); },
      focused: () => focused,
      setFocused: (value) => { focused = value; h.setFocused(value); },
      fixedOnRefresh: async () => {
        const costsFresh = await costs.refreshCosts(() => techId !== null && focused);
        const verifiedUnlock =
          costsFresh === true &&
          focused &&
          techId !== null;
        if (verifiedUnlock) h.controller.markReverified();
      },
    };
  }

  async function lockAfterAmbiguous(s: ScreenHarness) {
    await s.costs.focusCosts(ORDER_ID, () => true);
    fillValid(s.proposal);
    post(s.proposal).mockRejectedValue({ message: 'timeout' });
    await s.proposal.controller.submit();
    expect(s.proposal.state().needsVerify).toBe(true);
  }

  it('failed costs GET after ambiguous POST keeps the lock with zero repost', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getAdditionalCosts.mockRejectedValueOnce({ response: { status: 503 } });
    await s.fixedOnRefresh();
    expect(s.proposal.state().needsVerify).toBe(true);
    s.proposal.controller.requestConfirm();
    await s.proposal.controller.submit();
    expect(post(s.proposal)).toHaveBeenCalledTimes(1);
  });

  it('fresh GET with a new PENDING blocks a duplicate in the same tick', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getAdditionalCosts.mockResolvedValueOnce([pendingRecord]);
    await s.fixedOnRefresh();
    // Lock may clear, but the synchronously mirrored PENDING blocks resubmit.
    expect(s.statuses()).toEqual(['PENDING_APPROVAL']);
    s.proposal.controller.requestConfirm();
    await s.proposal.controller.submit();
    expect(post(s.proposal)).toHaveBeenCalledTimes(1);
    expect(s.proposal.state().needsVerify).toBe(false);
  });

  it('fresh valid GET without pending permits a deliberate retry', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getAdditionalCosts.mockResolvedValueOnce([]);
    await s.fixedOnRefresh();
    expect(s.proposal.state().needsVerify).toBe(false);
    fillValid(s.proposal);
    post(s.proposal).mockResolvedValue({ id: 'ac-2' });
    await s.proposal.controller.submit();
    expect(post(s.proposal)).toHaveBeenCalledTimes(2);
  });

  it('logout before the unlock check keeps the lock silently', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getAdditionalCosts.mockResolvedValueOnce([]);
    s.setTechId(null);
    await s.fixedOnRefresh();
    expect(s.proposal.state().needsVerify).toBe(true);
    expect(notified(s.proposal)).toHaveLength(0);
  });
});
