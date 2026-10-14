import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { customerWalletApi } from '../../../api/customer-wallet.api';
import { useAuthStore } from '../../../store/auth.store';
import { newEntryIntentId } from '../runtime/entry-attempt-production';
import { createCustomerWalletController, type CustomerWalletOwner } from './customer-wallet-controller';
import { createWalletTopUpJournal } from './wallet-top-up-journal';
export const customerWalletJournal = createWalletTopUpJournal(AsyncStorage);
export function createProductionCustomerWalletController(runtime: { getOwner: () => CustomerWalletOwner | null; isActive: () => boolean }, journal = customerWalletJournal) {
  return createCustomerWalletController({ ...runtime, journal, newKey: newEntryIntentId,
    getOwner: () => {
      const owner = runtime.getOwner(), auth = useAuthStore.getState();
      return owner && runtime.isActive() && auth.isAuthenticated && auth.user?.role === 'customer'
        && auth.user.id === owner.userId && auth.sessionGeneration === owner.sessionGeneration ? owner : null;
    }, transport: { readSummary: page => customerWalletApi.getSummary({ page }), topUp: customerWalletApi.topUp, openUrl: url => WebBrowser.openBrowserAsync(url) } });
}
