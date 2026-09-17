// src/types/navigation.types.ts
export type RootStackParamList = {
  Auth: undefined;
  CustomerMain: undefined;
  TechnicianMain: undefined;
  CustomerServices: { query?: string } | undefined;
  CustomerServiceDetail: undefined;
  CustomerAIDiagnosis: undefined;
  CustomerAIChat: undefined;
  CustomerMatching: undefined;
  CustomerTechFound: undefined;
  CustomerTracking: undefined;
  CustomerQuotation: undefined;
  CustomerUnderRepair: undefined;
  CustomerCompleted: undefined;
  CustomerReview: undefined;
  TechnicianKyc: undefined;
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
