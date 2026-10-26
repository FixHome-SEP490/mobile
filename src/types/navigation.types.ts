// src/types/navigation.types.ts
export type RootStackParamList = {
  Auth: undefined;
  CustomerRoleChoice: undefined;
  CustomerOnboarding: undefined;
  CustomerGuestHome: undefined;
  PublicOrderTracking: undefined;
  CustomerMain: undefined;
  TechnicianMain: undefined;
  CustomerServices: { query?: string; categoryCode?: string; serviceCode?: string; serviceAlias?: string } | undefined;
  CustomerServiceDetail: { serviceId: string };
  /**
   * The booking flow. `prefill` is how the assistant hands a customer over:
   * chat itself never creates a booking, it only carries the service across.
   */
  CustomerAIDiagnosis:
    | {
        prefill?: {
          serviceId?: string | null;
          serviceCode?: string;
          serviceName?: string;
          description?: string;
          /** Assistant session; the technician who accepts gets a summary of it. */
          aiSessionId?: string;
          /** Photos and videos sent in the assistant chat, already uploaded, for the technician (PO 18/10/2026). */
          attachmentUploadIds?: { uploadId: string; kind: 'image' | 'video' }[];
        };
      }
    | undefined;
  /**
   * The assistant. Opened empty from the tab bar, or carrying a first message
   * when the customer came from the diagnosis screen with photos to look at.
   */
  CustomerAIChat:
    | {
        initialDescription?: string;
        /** Data URIs, at most three. */
        initialImages?: string[];
      }
    | undefined;
  CustomerBookingCreate:
    | {
        prefill?: {
          serviceId?: string | null;
          serviceCode?: string;
          serviceName?: string;
          description?: string;
          /** Assistant session; the technician who accepts gets a summary of it. */
          aiSessionId?: string;
          /** Photos and videos sent in the assistant chat, already uploaded, for the technician (PO 18/10/2026). */
          attachmentUploadIds?: { uploadId: string; kind: 'image' | 'video' }[];
        };
      }
    | undefined;
  /**
   * `rebooked: 'choose'` after "Đặt lại thợ" when the former technician was not free.
   * `released: true` when the technician stepped off the order because the previous job overran (BE 20/10/2026).
   */
  CustomerMatching: { bookingId: string; rebooked?: 'choose'; released?: true; visitGroupId?: string };
  CustomerVisit: { visitGroupId: string };
  /** Several devices in one visit; `prefill.devices` are the assistant's suggestions, each still checked and saved by the customer. */
  CustomerVisitCreate: { prefill?: { aiSessionId?: string; devices: { serviceId: string; description: string }[] } } | undefined;
  /**
   * `rebooked: 'invited'` after "Đặt lại thợ" when the former technician was invited.
   * `released: true` when opened from the `TECHNICIAN_RELEASED` notification.
   */
  CustomerBookingDetail: { bookingId: string; rebooked?: 'invited'; released?: true };
  /** `screen` opens a Customer OrderFlow child directly (e.g. the warranty list from the Warranties tab). */
  CustomerOrderDetail: { serviceOrderId: string; screen?: 'CustomerWarranty' };
  CustomerRepairHistory: undefined;
  CustomerWarranties: { orderId?: string } | undefined;
  CustomerSecurity: undefined;
  /** Customer-only FixHome wallet (overview + top-up). No Technician equivalent at this route. */
  CustomerWallet: undefined;
  /** Customer-only identity verification; never exposed to guests or Technicians. */
  CustomerKyc: undefined;
  /** Customer-only bank account, withdrawal confirmation, and paged history. */
  CustomerWithdraw: undefined;
  TechnicianOrderDetail: { serviceOrderId: string };
  /** Internal M2 reader preview, registered only in __DEV__; role comes from authenticated state. */
  OrderFlowDevPreview: { serviceOrderId: string };
  /** Internal M7 entry points, registered only in __DEV__; IDs still pass through production ownership checks. */
  M7AftercareDevPreview: undefined;
  BookingAftercareDevPreview: { bookingId: string };
  TechnicianWarrantyDevPreview: { claimId?: string };
  TechnicianKyc: undefined;
  TechnicianOnboarding: undefined;
  TechnicianWallet: undefined;
  TechnicianReviews: undefined;
  TechnicianSchedule: undefined;
  TechnicianServiceAreas: undefined;
  TechnicianEarnings: undefined;
  TechnicianNotifications: undefined;
  ChatList: undefined;
  ChatThread: {
    conversationId: string;
    counterpartName: string;
    serviceName?: string;
  };
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyRegisterOtp: { email: string; password: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type CustomerTabParamList = {
  Home: undefined;
  Bookings: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type TechnicianTabParamList = {
  Home: undefined;
  Invitations: undefined;
  Jobs: undefined;
  Notifications: undefined;
  Profile: undefined;
};
