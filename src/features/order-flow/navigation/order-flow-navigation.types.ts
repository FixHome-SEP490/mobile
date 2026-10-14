import type { CustomerTaskId, TechnicianTaskId } from '../domain/order-session.types';

export type CustomerOrderFlowParamList = {
  OrderTask: { taskId?: CustomerTaskId } | undefined;
  OrderInformation: undefined;
  OrderProgressHistory: undefined;
  EvidenceGallery: undefined;
  EvidenceViewer: { evidenceId: string };
  ScopeDetail: undefined;
  InvoiceDetail: undefined;
  ProposalDetail: { proposalId?: string } | undefined;
  /** Manual C09a wallet payment. Focused screen; never an automatic OrderTask taskId. */
  WalletPayment: undefined;
  /** Manual handover review. Lets the customer inspect handover before paying; never an automatic OrderTask taskId. */
  HandoverReview: undefined;
};

export type TechnicianOrderFlowParamList = Omit<CustomerOrderFlowParamList, 'OrderTask'> & {
  OrderTask: { taskId?: TechnicianTaskId } | undefined;
  /** Manual T04 arrival verification. Distinct route, never an automatic OrderTask taskId. */
  ArrivalCheckIn: undefined;
  /**
   * Manual BEFORE capture used from TR recovery while Backend is still EN_ROUTE.
   * Hosts the same frozen-guarded capture UI; never an automatic OrderTask taskId.
   */
  BeforeCapture: undefined;
  PersonalOrderNotes: undefined;
  ExtraProposal: { proposalId?: string; costId?: string; capturedAfter?: boolean } | undefined;
  ExtraWaiting: undefined;
  PartsLifecycle: undefined;
  /** Navigation-only continuation of the base scope while extras await approval. */
  RepairWorkspace: undefined;
  AcceptedParts: undefined;
  /** Manual T13 AFTER capture. Distinct route, never an automatic OrderTask taskId. */
  AfterEvidence: { fromProposal?: boolean; proposalId?: string } | undefined;
  /** Manual T14 completion request. Distinct route, never an automatic OrderTask taskId. */
  CompletionRequest: undefined;
  /** Manual T15a cash declaration. Distinct route, never an automatic OrderTask taskId. */
  CashDeclaration: undefined;
};
