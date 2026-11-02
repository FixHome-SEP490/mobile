import { StackActions } from '@react-navigation/native';
import { useAuthStore } from '../../../store/auth.store';
import { goHome } from '../../../components/BackButton';

// Lazy like goHome: root-navigation needs a container ref that screen tests lack.
const root = () => import('../../../navigation/root-navigation').then((m) => m.rootNavigationRef);

// Only ever pushes or pops the top of the root stack: reordering routes of a native stack hangs the app.
const pushMain = (tab: 'Home' | 'Jobs') => void root().then((ref) => {
  if (ref.isReady()) ref.dispatch(StackActions.push('TechnicianMain', { screen: tab }));
});

/**
 * Home from inside a technician's order screen: stacks the home tabs over it instead of dropping it,
 * so the inputs, photos and tabs of the order are still there when the technician comes back.
 */
export function leaveFlowToHome(): void {
  if (useAuthStore.getState().user?.role !== 'technician') { goHome(); return; }
  pushMain('Home');
}

/** Opens an order (or any device of a visit): goes back to the kept order screen when there is one, else calls `open`. */
export function openOrResume(orderIds: string[], open: () => void): void {
  void root().then((ref) => {
    const routes = ref.isReady() ? ref.getRootState()?.routes ?? [] : [];
    const at = routes.map((r) => r.name).lastIndexOf('TechnicianOrderDetail');
    const params = routes[at]?.params as { serviceOrderId?: string } | undefined;
    if (at > 0 && params?.serviceOrderId && orderIds.includes(params.serviceOrderId)) ref.dispatch(StackActions.popTo('TechnicianOrderDetail', params));
    else open();
  }).catch(open);
}

/** Leaves the order screen for the Jobs tab but keeps it underneath, so coming back finds it as it was. */
export function goJobsKeepingFlow(): void { pushMain('Jobs'); }

/** Back of the first screen of a technician's order flow keeps the order screen; every other back is a plain goBack. */
export function backFromFlow(navigation: { getState?: () => { index: number }; goBack: () => void }): void {
  if (useAuthStore.getState().user?.role === 'technician' && navigation.getState?.().index === 0) goJobsKeepingFlow();
  else navigation.goBack();
}
