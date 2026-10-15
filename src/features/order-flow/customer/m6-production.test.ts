import { useAuthStore } from '../../../store/auth.store';
import { ordersApi } from '../../../api/orders.api';
import { customerWalletApi } from '../../../api/customer-wallet.api';
import { createProductionOrderPaymentController } from './order-payment-production';
import { createProductionCustomerWalletController } from './wallet-production';
import { createProductionTechnicianCompletionController, captureAndUploadAfter } from '../technician/completion-production';
import { createProductionTechnicianCashController } from '../technician/cash-production';
import { createWalletTopUpJournal } from './wallet-top-up-journal';
import { m6Fixture, deferred, afterAsset, proof, walletSummary } from './m6-fixtures.test-utils';
import * as Camera from '../technician/camera-capture';
import * as Browser from 'expo-web-browser';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => {} } }));
jest.mock('../technician/camera-capture', () => ({ captureCameraPhoto: jest.fn(), confirmCameraPermission: jest.fn(async () => true) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
function auth(role: 'customer' | 'technician', id = role === 'customer' ? 'customer' : 'tech') {
  useAuthStore.setState({ user: { id, role } as never, isAuthenticated: true, sessionGeneration: 1 });
}
beforeEach(() => jest.clearAllMocks());
it('production order payment uses the existing exact APIs and full auth generation', async () => {
  auth('customer'); const f = m6Fixture();
  jest.spyOn(customerWalletApi, 'getSummary').mockResolvedValue(walletSummary() as never);
  const pay = jest.spyOn(ordersApi, 'payInvoiceWithWallet').mockImplementation(async () => { f.server.invoice!.paymentStatus = 'paid'; });
  const c = createProductionOrderPaymentController(f.runtime); await c.requestPayment('wallet');
  useAuthStore.setState({ sessionGeneration: 2 }); await c.submitConfirmation(); expect(pay).not.toHaveBeenCalled();
  auth('customer'); await c.requestPayment('wallet'); await c.submitConfirmation(); expect(pay).toHaveBeenCalledWith('invoice');
  jest.restoreAllMocks();
});
it('production AFTER uses private upload and capture continuation is fenced by full owner', async () => {
  auth('technician'); const f = m6Fixture('technician');
  const upload = jest.spyOn(ordersApi, 'uploadEvidenceAfter').mockImplementation(async () => { f.server.evidence.push(proof('new')); return { id: 'new' }; });
  const c = createProductionTechnicianCompletionController(f.runtime);
  const gate = deferred<Camera.CameraCaptureResult>(); (Camera.captureCameraPhoto as jest.Mock).mockReturnValueOnce(gate.promise);
  const pending = captureAndUploadAfter(f.runtime, c); useAuthStore.setState({ sessionGeneration: 2 }); gate.resolve({ ok: true, asset: afterAsset });
  await pending; expect(upload).not.toHaveBeenCalled();
  auth('technician'); (Camera.captureCameraPhoto as jest.Mock).mockResolvedValue({ ok: true, asset: afterAsset });
  await captureAndUploadAfter(f.runtime, c); expect(upload).toHaveBeenCalledWith('order', { uri: 'file://private.jpg', name: 'after.jpg', type: 'image/jpeg' });
  expect(c.getState().confirmedUpload?.id).toBe('new'); jest.restoreAllMocks();
});
it('wrong actor factories cannot dispatch and wallet URL uses installed external browser', async () => {
  auth('customer'); const f = m6Fixture('technician');
  const declare = jest.spyOn(ordersApi, 'declareCashSettlement').mockResolvedValue({});
  const cash = createProductionTechnicianCashController(f.runtime); await cash.requestDeclaration({ declaredAmount: 120000 }); await cash.submitConfirmation(); expect(declare).not.toHaveBeenCalled();
  const topUp = jest.spyOn(customerWalletApi, 'topUp').mockResolvedValue({ paymentId: 'payment', paymentUrl: 'https://payments.example.test/start' });
  jest.spyOn(customerWalletApi, 'getSummary').mockResolvedValue(walletSummary(0) as never);
  const journal = createWalletTopUpJournal({ getItem: async () => null, setItem: async () => {} });
  const c = createProductionCustomerWalletController({ getOwner: () => ({ userId: 'customer', role: 'customer', sessionGeneration: 1 }), isActive: () => true }, journal);
  await c.requestTopUp(10000); await c.submitConfirmation(); await c.openPaymentUrl(); expect(topUp).toHaveBeenCalledTimes(1); expect(Browser.openBrowserAsync).toHaveBeenCalledWith('https://payments.example.test/start');
  jest.restoreAllMocks();
});
