import React, { useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { resolveCustomerTask, resolveTechnicianTask } from '../domain/order-task-resolver';
import type { OrderTaskResolution, OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { sameOrderSession } from '../domain/order-session.types';
import { getRestoredQuotationRecovery } from '../domain/quotation-recovery';
import { isUnresolvedMarker } from '../customer/payment-facts';
import type { OrderCommandJournal } from '../runtime/order-command-journal';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import {
  keepManualArrivalCheckIn,
  keepManualBeforeCapture,
  requiredTaskResources,
  taskRouteTransition,
} from '../navigation/order-flow-navigation';
import AssignedOrderScreen from '../customer/AssignedOrderScreen';
import ArrivalStatusScreen from '../customer/ArrivalStatusScreen';
import RepairStatusScreen from '../customer/RepairStatusScreen';
import QuoteDecisionScreen from '../customer/QuoteDecisionScreen';
import AcceptedJobScreen from '../technician/AcceptedJobScreen';
import TravelScreen from '../technician/TravelScreen';
import FaceCheckInScreen from '../technician/FaceCheckInScreen';
import BeforeEvidenceScreen from '../technician/BeforeEvidenceScreen';
import QuotationFormScreen from '../technician/QuotationFormScreen';
import QuotationWaitingScreen from '../technician/QuotationWaitingScreen';
import RepairRecoveryScreen from '../technician/RepairRecoveryScreen';
import RepairWorkspaceScreen from '../technician/RepairWorkspaceScreen';
import ExtraDecisionScreen from '../customer/ExtraDecisionScreen';
import ExtraWaitingScreen from '../technician/ExtraWaitingScreen';
import ExtraProposalScreen from '../technician/ExtraProposalScreen';
import PartsLifecycleScreen from '../technician/PartsLifecycleScreen';
import AcceptedPartsScreen from '../technician/AcceptedPartsScreen';
import HandoverReviewScreen from '../customer/HandoverReviewScreen';
import PaymentMethodScreen from '../customer/PaymentMethodScreen';
import CashConfirmationScreen from '../customer/CashConfirmationScreen';
import PaymentResultScreen from '../customer/PaymentResultScreen';
import PaymentWaitingScreen from '../technician/PaymentWaitingScreen';
import CompletedOrderScreen from './CompletedOrderScreen';
import AfterEvidenceScreen from '../technician/AfterEvidenceScreen';
import CompletionRequestScreen from '../technician/CompletionRequestScreen';
import CashDeclarationScreen from '../technician/CashDeclarationScreen';
import { getRestoredExtraRecovery, getRestoredPartsRecovery } from '../domain/extra-and-parts-recovery';
import { ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';

type M6RecoveryTarget = 'payment' | 'after-evidence' | 'completion-request' | 'cash-declare';

/**
 * Scoped read-only M6 recovery: the first owned unresolved marker among the
 * M6 payment/completion/cash operations. Evidence-delete only counts with the
 * M6 stable key so frozen M3 BEFORE deletion never hijacks this dispatcher.
 * GET-only recovery surfaces; resolved/failed-known markers need no override.
 */
function getRestoredM6Recovery(
  journal: OrderCommandJournal,
  key: OrderSessionKey,
  snapshot: OrderSessionSnapshot,
): M6RecoveryTarget | null {
  if (snapshot.access !== 'current' || !sameOrderSession(snapshot.key, key)) return null;
  if (snapshot.order.status !== 'ready') return null;
  const order = snapshot.order.data;
  if (!order || order.id !== key.serviceOrderId || isHistoricalOrder(order)) return null;
  if (key.role === 'technician' && order.technician?.id !== key.userId) return null;
  const allowed = key.role === 'customer'
    ? ['wallet-pay', 'vnpay-url', 'no-charge', 'cash-confirm']
    : ['after-upload', 'evidence-delete', 'request-completion', 'cash-declare'];
  const match = journal.list(key.userId).find(m =>
    allowed.includes(m.operation) && m.serviceOrderId === key.serviceOrderId && m.role === key.role
    && isUnresolvedMarker(m) && (m.operation !== 'evidence-delete' || m.stableKey === 'm6-after-delete'));
  if (!match) return null;
  if (match.operation === 'request-completion') return 'completion-request';
  if (match.operation === 'cash-declare') return 'cash-declare';
  if (match.operation === 'after-upload' || match.operation === 'evidence-delete') return 'after-evidence';
  return 'payment';
}

/**
 * Thin M3 dispatcher. One focused task body per resolution; no detail button wall.
 * Manual T04 and manual BEFORE capture are separate stack routes and are never
 * set as automatic taskIds here. Tasks outside U1/U2 keep an honest waiting
 * shell; their UI belongs to later milestones.
 */
export default function OrderTaskScreen({ role }: { role: 'customer' | 'technician' }) {
  const { key, snapshot, loadResource, journal, refresh } = useOrderSession();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const liveResolution: OrderTaskResolution | null = snapshot
    ? role === 'customer'
      ? resolveCustomerTask(snapshot)
      : resolveTechnicianTask(snapshot)
    : null;
  // A refresh briefly drops the order to 'loading'. Unmounting the task then would destroy its
  // controller mid-command (the command's owner turns inactive and the POST is never sent), so
  // keep the last task mounted; its guards stay closed until the order is ready again.
  // Resources reload right after the order does; resolving then flips the task to the TR/TX fallback.
  const refreshing = snapshot?.access === 'current'
    && (snapshot.order.status === 'loading' || Object.values(snapshot.resources).some(r => r.status === 'loading'));
  const [lastTask, setLastTask] = useState<OrderTaskResolution | null>(null);
  // The same holds for T02: its depart command writes the marker before the POST, and unmounting
  // the screen there kills the controller so the POST is never sent (confirm bounced back to start).
  // A camera upload writes its pending marker, which resolves to TR; the capture screen owns that
  // command and already renders the pending/verify state, so it must not be unmounted underneath it.
  // Likewise C09 owns the VNPay link its own submit just created, and C10 its cash confirm (its marker flips the task to C11 before the POST is sent); the marker must not swap the screen away.
  const hold = refreshing || (snapshot?.pendingIntent === true && (
    (liveResolution?.taskId === 'TR' && (lastTask?.taskId === 'T02' || lastTask?.taskId === 'T05' || lastTask?.taskId === 'T06'))
    || ((liveResolution?.taskId === 'C11' || liveResolution?.taskId === 'CX') && (lastTask?.taskId === 'C09' || lastTask?.taskId === 'C10'))));
  if (liveResolution && !hold && lastTask?.taskId !== liveResolution.taskId) setLastTask(liveResolution);
  const resolution = hold && lastTask ? lastTask : liveResolution;
  const shownTask = resolution?.taskId, orderState = snapshot?.order.status, accessState = snapshot?.access, pending = snapshot?.pendingIntent;
  useEffect(() => {
    if (__DEV__) console.warn('[order-task]', JSON.stringify({ live: liveResolution?.taskId, shown: shownTask, blockers: liveResolution?.blockers, order: orderState, access: accessState, pending, refreshing }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveResolution?.taskId, shownTask, orderState, accessState, pending, refreshing]);
  const resolutionTaskId = resolution?.taskId;

  useEffect(() => {
    if (!snapshot || snapshot.key.role !== role) return;
    requiredTaskResources(snapshot).forEach(kind => {
      if (snapshot.resources[kind].status === 'unloaded') void loadResource(kind);
    });
  }, [snapshot, role, loadResource]);

  useEffect(() => {
    if (!resolutionTaskId || !resolution || !snapshot) return;
    if (keepManualArrivalCheckIn(route.name) || keepManualBeforeCapture(route.name)) return;
    const currentTaskId = route.params?.taskId;
    const transition = taskRouteTransition(currentTaskId, resolution, snapshot);
    if (transition.kind === 'replace' && transition.taskId !== currentTaskId) {
      navigation.setParams({ taskId: transition.taskId });
    }
  }, [navigation, resolution, resolutionTaskId, snapshot, route.name, route.params?.taskId]);

  if (!snapshot || snapshot.access !== 'current' || (snapshot.order.status !== 'ready' && !(hold && lastTask)) || !resolution) {
    // A failed read must not look like endless loading: say so and offer a read-only retry.
    if (snapshot?.order.status === 'error') {
      return (
        <TaskScreenShell
          title="Đơn dịch vụ"
          stage={null}
          onBack={() => navigation.goBack()}
          primary={{ label: 'Thử lại', onPress: () => void refresh('manual') }}
        >
          <ReadOnlyNotice>Chưa tải được thông tin đơn. Vui lòng kiểm tra kết nối rồi thử lại.</ReadOnlyNotice>
        </TaskScreenShell>
      );
    }
    return (
      <TaskScreenShell title="Đơn dịch vụ" stage={null} onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          Đang xác minh quyền truy cập và tải thông tin đơn. Các thao tác vẫn bị khóa trong lúc chờ dữ liệu chuẩn.
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  if (role === 'customer') {
    if (resolution.taskId === 'C03') return <AssignedOrderScreen />;
    if (resolution.taskId === 'C04') return <ArrivalStatusScreen />;
    if (resolution.taskId === 'C05') return <QuoteDecisionScreen />;
    if (resolution.taskId === 'C06') return <RepairStatusScreen />;
    if (resolution.taskId === 'C07') return <ExtraDecisionScreen />;
    if (resolution.taskId === 'C08') return <HandoverReviewScreen />;
    if (resolution.taskId === 'C09') return <PaymentMethodScreen />;
    if (resolution.taskId === 'C10') return <CashConfirmationScreen />;
    if (resolution.taskId === 'C11') return <PaymentResultScreen />;
    if (resolution.taskId === 'C12') return <CompletedOrderScreen role="customer" />;
  } else {
    if (resolution.taskId === 'T02') return <AcceptedJobScreen />;
    if (resolution.taskId === 'T03') return <TravelScreen />;
    if (resolution.taskId === 'T05') return <FaceCheckInScreen />;
    if (resolution.taskId === 'T06') return <BeforeEvidenceScreen />;
    if (resolution.taskId === 'T07') return <QuotationFormScreen />;
    if (resolution.taskId === 'T08') return <QuotationWaitingScreen />;
    if (resolution.taskId === 'T09') return <RepairWorkspaceScreen />;
    if (resolution.taskId === 'T11') return <ExtraWaitingScreen />;
    if (resolution.taskId === 'T15') return <PaymentWaitingScreen />;
    if (resolution.taskId === 'T16') return <CompletedOrderScreen role="technician" />;
  }

  // Scoped quotation/extra/parts recovery overrides only the generic CX/TX/TR fallback: a
  // current owned marker renders its focused screen with GET-only verification.
  // Focused resolutions (C05/C07/T07/T08/T11) already render above and are never hijacked here.
  if ((resolution.taskId === 'CX' || resolution.taskId === 'TX' || resolution.taskId === 'TR') && key && journal) {
    const recovery = getRestoredQuotationRecovery(journal, key, snapshot);
    if (recovery.hasRecovery && recovery.isUnresolved) {
      if (role === 'customer' && recovery.operation === 'quote-decision') return <QuoteDecisionScreen />;
      if (role === 'technician' && recovery.operation === 'quote-create') return <QuotationFormScreen />;
    }
    const extraRec = getRestoredExtraRecovery(journal, key, snapshot);
    if (extraRec.hasRecovery && extraRec.isUnresolved) {
      if (role === 'customer' && extraRec.operation === 'extra-decision') return <ExtraDecisionScreen />;
      if (role === 'technician' && (extraRec.operation === 'extra-create' || extraRec.operation === 'extra-revise')) {
        return <ExtraProposalScreen />;
      }
    }
    if (role === 'technician') {
      const partsRec = getRestoredPartsRecovery(journal, key, snapshot);
      if (partsRec.hasRecovery && partsRec.isUnresolved) {
        if (partsRec.operation === 'parts-create') return <AcceptedPartsScreen />;
        return <PartsLifecycleScreen />;
      }
      // M6 scoped recoveries: owned unresolved markers render their focused
      // GET-only screen. Completion/cash markers map to their manual screens
      // only as recovery surfaces; normal entry stays on explicit navigation.
      const m6 = getRestoredM6Recovery(journal, key, snapshot);
      if (m6 === 'completion-request') return <CompletionRequestScreen />;
      if (m6 === 'cash-declare') return <CashDeclarationScreen />;
      if (m6 === 'after-evidence') return <AfterEvidenceScreen />;
    }
    if (role === 'customer') {
      const m6 = getRestoredM6Recovery(journal, key, snapshot);
      if (m6 === 'payment') return <PaymentResultScreen />;
    }
  }

  if (role === 'technician' && resolution.taskId === 'TR') return <RepairRecoveryScreen />;

  return (
    <TaskScreenShell title="Đơn dịch vụ" stage={resolution.stage} onBack={() => navigation.goBack()}>
      <ReadOnlyNotice>
        Bước tiếp theo của đơn đang được hoàn thiện. Dữ liệu đơn vẫn an toàn; bạn có thể xem thông tin đơn hoặc làm mới dữ liệu.
      </ReadOnlyNotice>
    </TaskScreenShell>
  );
}
