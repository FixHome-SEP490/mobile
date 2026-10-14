import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import type { CustomerOrderFlowParamList, TechnicianOrderFlowParamList } from './order-flow-navigation.types';
import OrderTaskScreen from '../shared/OrderTaskScreen';
import ArrivalCheckInScreen from '../technician/ArrivalCheckInScreen';
import BeforeEvidenceScreen from '../technician/BeforeEvidenceScreen';
import OrderInformationScreen from '../shared/OrderInformationScreen';
import OrderProgressHistoryScreen from '../shared/OrderProgressHistoryScreen';
import EvidenceGalleryScreen from '../shared/EvidenceGalleryScreen';
import EvidenceViewerScreen from '../shared/EvidenceViewerScreen';
import ScopeDetailScreen from '../shared/ScopeDetailScreen';
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

const CustomerStack = createNativeStackNavigator<CustomerOrderFlowParamList>();
const TechnicianStack = createNativeStackNavigator<TechnicianOrderFlowParamList>();

function Screens({ Stack, role, reduceMotion }: { Stack: { Navigator: React.ComponentType<any>; Screen: React.ComponentType<any> }; role: 'customer' | 'technician'; reduceMotion: boolean }) {
  return <Stack.Navigator initialRouteName="OrderTask" screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'slide_from_right' }}>
    <Stack.Screen name="OrderTask">{() => <OrderTaskScreen role={role} />}</Stack.Screen>
    <Stack.Screen name="OrderInformation" component={OrderInformationScreen} />
    <Stack.Screen name="OrderProgressHistory" component={OrderProgressHistoryScreen} />
    <Stack.Screen name="EvidenceGallery" component={EvidenceGalleryScreen} />
    <Stack.Screen name="EvidenceViewer" component={EvidenceViewerScreen} />
    <Stack.Screen name="ScopeDetail" component={ScopeDetailScreen} />
    <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
    <Stack.Screen name="ProposalDetail" component={ProposalDetailScreen} />
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
  </Stack.Navigator>;
}

export default function OrderFlowNavigator({ role }: { role: 'customer' | 'technician' }) {
  const reduceMotion = useReduceMotion(true);
  return role === 'customer'
    ? <Screens Stack={CustomerStack} role={role} reduceMotion={reduceMotion} />
    : <Screens Stack={TechnicianStack} role={role} reduceMotion={reduceMotion} />;
}
