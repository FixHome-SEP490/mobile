// src/types/navigation.types.ts
export type RootStackParamList = {
  Auth: undefined;
  CustomerMain: undefined;
  TechnicianMain: undefined;
  CustomerServices: { query?: string; categoryCode?: string } | undefined;
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
        };
      }
    | undefined;
  CustomerMatching: { bookingId: string };
  CustomerBookingDetail: { bookingId: string };
  CustomerOrderDetail: { serviceOrderId: string };
  CustomerRepairHistory: undefined;
  CustomerWarranties: { orderId?: string } | undefined;
  CustomerSecurity: undefined;
  TechnicianOrderDetail: { serviceOrderId: string };
  TechnicianKyc: undefined;
  TechnicianOnboarding: undefined;
  TechnicianWallet: undefined;
  TechnicianReviews: undefined;
  TechnicianSchedule: undefined;
  TechnicianServiceAreas: undefined;
  TechnicianEarnings: undefined;
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
