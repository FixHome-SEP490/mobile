import React, { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import type { CustomerOrderFlowParamList, TechnicianOrderFlowParamList } from './order-flow-navigation.types';
import OrderTaskScreen from '../shared/OrderTaskScreen';
import ArrivalCheckInScreen from '../technician/ArrivalCheckInScreen';
import BeforeEvidenceScreen from '../technician/BeforeEvidenceScreen';
import OrderInformationScreen from '../shared/OrderInformationScreen';
import OrderProgressHistoryScreen from '../shared/OrderProgressHistoryScreen';
import EvidenceGalleryScreen from '../shared/EvidenceGalleryScreen';
import EvidenceViewerScreen from '../shared/EvidenceViewerScreen';
import InvoiceDetailScreen from '../shared/InvoiceDetailScreen';
import ProposalDetailScreen from '../shared/ProposalDetailScreen';
import PersonalOrderNotesScreen from '../shared/PersonalOrderNotesScreen';
import ExtraProposalScreen from '../technician/ExtraProposalScreen';
import ExtraWaitingScreen from '../technician/ExtraWaitingScreen';
import PartsLifecycleScreen from '../technician/PartsLifecycleScreen';
import AcceptedPartsScreen from '../technician/AcceptedPartsScreen';
import RepairWorkspaceScreen from '../technician/RepairWorkspaceScreen';
import WalletPaymentScreen from '../customer/WalletPaymentScreen';
import HandoverReviewScreen from '../customer/HandoverReviewScreen';
import AfterEvidenceScreen from '../technician/AfterEvidenceScreen';
import CompletionRequestScreen from '../technician/CompletionRequestScreen';
import CashDeclarationScreen from '../technician/CashDeclarationScreen';
import OrderExceptionScreen from '../shared/OrderExceptionScreen';
import { CustomerReviewScreen, CustomerWarrantyScreen, CustomerWarrantyClaimScreen, WarrantyClaimCreateScreen } from '../aftercare/CustomerAftercareScreens';
import { SupportCaseListScreen, SupportCaseCreateScreen, SupportCaseDetailScreen } from '../aftercare/SupportCaseScreens';
import { TechnicianWarrantyInboxScreen, TechnicianWarrantyTaskScreen } from '../technician/TechnicianWarrantyScreens';

const CustomerStack = createNativeStackNavigator<CustomerOrderFlowParamList>();
const TechnicianStack = createNativeStackNavigator<TechnicianOrderFlowParamList>();

// Module-level on purpose: an inline render callback is a new component type on every render, which remounts
// the task screen and drops its confirm draft and in-flight command whenever a parent re-renders.
const CustomerTask = () => <OrderTaskScreen role="customer" />;
const TechnicianTask = () => <OrderTaskScreen role="technician" />;

function Screens({ Stack, role, reduceMotion }: { Stack: { Navigator: React.ComponentType<any>; Screen: React.ComponentType<any> }; role: 'customer' | 'technician'; reduceMotion: boolean }) {
  return <Stack.Navigator initialRouteName="OrderTask" screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'slide_from_right' }}>
    <Stack.Screen name="OrderTask" component={role === 'customer' ? CustomerTask : TechnicianTask} />
    <Stack.Screen name="OrderInformation" component={OrderInformationScreen} />
    <Stack.Screen name="OrderProgressHistory" component={OrderProgressHistoryScreen} />
    <Stack.Screen name="EvidenceGallery" component={EvidenceGalleryScreen} />
    <Stack.Screen name="EvidenceViewer" component={EvidenceViewerScreen} />
    <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
    <Stack.Screen name="ProposalDetail" component={ProposalDetailScreen} />
    <Stack.Screen name="SupportCases" component={SupportCaseListScreen} />
    <Stack.Screen name="SupportCreate" component={SupportCaseCreateScreen} />
    <Stack.Screen name="SupportCaseDetail" component={SupportCaseDetailScreen} />
    <Stack.Screen name="OrderException" component={OrderExceptionScreen} />
    {role === 'technician' && <Stack.Screen name="ArrivalCheckIn" component={ArrivalCheckInScreen} />}
    {role === 'technician' && <Stack.Screen name="BeforeCapture" component={BeforeEvidenceScreen} />}
    {role === 'technician' && <Stack.Screen name="PersonalOrderNotes" component={PersonalOrderNotesScreen} />}
    {role === 'technician' && <Stack.Screen name="ExtraProposal" component={ExtraProposalScreen} />}
    {role === 'technician' && <Stack.Screen name="ExtraWaiting" component={ExtraWaitingScreen} />}
    {role === 'technician' && <Stack.Screen name="PartsLifecycle" component={PartsLifecycleScreen} />}
    {role === 'technician' && <Stack.Screen name="AcceptedParts" component={AcceptedPartsScreen} />}
    {role === 'technician' && <Stack.Screen name="RepairWorkspace" component={RepairWorkspaceScreen} />}
    {role === 'technician' && <Stack.Screen name="AfterEvidence" component={AfterEvidenceScreen} />}
    {role === 'technician' && <Stack.Screen name="CompletionRequest" component={CompletionRequestScreen} />}
    {role === 'technician' && <Stack.Screen name="CashDeclaration" component={CashDeclarationScreen} />}
    {role === 'customer' && <Stack.Screen name="WalletPayment" component={WalletPaymentScreen} />}
    {role === 'customer' && <Stack.Screen name="HandoverReview" component={HandoverReviewScreen} />}
    {role === 'customer' && <Stack.Screen name="CustomerReview" component={CustomerReviewScreen} />}
    {role === 'customer' && <Stack.Screen name="CustomerWarranty" component={CustomerWarrantyScreen} />}
    {role === 'customer' && <Stack.Screen name="WarrantyClaimCreate" component={WarrantyClaimCreateScreen} />}
    {role === 'customer' && <Stack.Screen name="CustomerWarrantyClaim" component={CustomerWarrantyClaimScreen} />}
    {role === 'technician' && <Stack.Screen name="TechnicianWarrantyInbox" component={TechnicianWarrantyInboxScreen} />}
    {role === 'technician' && <Stack.Screen name="TechnicianWarrantyTask" component={TechnicianWarrantyTaskScreen} />}
  </Stack.Navigator>;
}

// Orders update by themselves: a server push for this order (or the 15 s poll while the socket is down) re-reads it.
// A re-read drops the order to 'loading', which would make a command that is still verifying its own result
// give up as unknown, so while a command is pending the read waits and runs once the command has settled.
function LiveOrderRefresh() {
  const { key, snapshot, refresh } = useOrderSession();
  const pending = snapshot?.pendingIntent === true;
  const pendingRef = useRef(pending);
  const missed = useRef(false);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    if (pendingRef.current) missed.current = true; else void refreshRef.current('focus');
  }, []));
  useEffect(() => {
    pendingRef.current = pending;
    if (!pending && missed.current) { missed.current = false; void refresh('live'); }
  }, [pending, refresh]);
  useLiveRefresh(['order:updated'], () => {
    if (pendingRef.current) missed.current = true; else void refresh('live');
  }, event => !event.payload.serviceOrderId || event.payload.serviceOrderId === key?.serviceOrderId, { pollMs: 15_000 });
  return null;
}

export default function OrderFlowNavigator({ role }: { role: 'customer' | 'technician' }) {
  const reduceMotion = useReduceMotion(true);
  return <>
    <LiveOrderRefresh />
    {role === 'customer'
      ? <Screens Stack={CustomerStack} role={role} reduceMotion={reduceMotion} />
      : <Screens Stack={TechnicianStack} role={role} reduceMotion={reduceMotion} />}
  </>;
}
