// src/types/navigation.types.ts
export type RootStackParamList = {
  Auth: undefined;
  CustomerMain: undefined;
  TechnicianMain: undefined;
  CustomerServices: { query?: string } | undefined;
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
        };
      }
    | undefined;
  CustomerMatching: { bookingId: string };
  CustomerOrderDetail: { serviceOrderId: string };
  TechnicianOrderDetail: { serviceOrderId: string };
  CustomerTechFound: undefined;
  CustomerTracking: undefined;
  CustomerQuotation: { orderId?: string } | undefined;
  CustomerUnderRepair: undefined;
  CustomerCompleted: undefined;
  CustomerReview: undefined;
  TechnicianKyc: undefined;
  TechnicianInvitations: undefined;
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
  Jobs: undefined;
  Notifications: undefined;
  Profile: undefined;
};
