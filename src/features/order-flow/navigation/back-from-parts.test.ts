import { backFromParts } from './resume-order';
jest.mock('../../../store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { role: 'technician' } }) } }));
jest.mock('../../../components/BackButton', () => ({ goHome: jest.fn() }));

const stack = (names: string[], goBack = jest.fn()) => ({ goBack, getParent: () => undefined, getState: () => ({ routeNames: ['TechnicianOrderDetail'], routes: names.map(name => ({ name })) }) });
const nested = (parent: ReturnType<typeof stack>) => ({ goBack: jest.fn(), getState: () => ({ index: 1 }), getParent: () => parent });

it('closes the order screen to show the warranty claim it was opened over', () => {
  const root = stack(['TechnicianMain', 'TechnicianWarrantyTask', 'TechnicianOrderDetail']), inner = nested(root);
  backFromParts(inner as any, true);
  expect(root.goBack).toHaveBeenCalledTimes(1); expect(inner.goBack).not.toHaveBeenCalled();
});

it('still finds the claim underneath when the flag did not arrive, and leaves other orders alone', () => {
  const fromClaim = stack(['TechnicianMain', 'TechnicianWarrantyTask', 'TechnicianOrderDetail']);
  backFromParts(nested(fromClaim) as any); expect(fromClaim.goBack).toHaveBeenCalledTimes(1);
  const plain = stack(['TechnicianMain', 'TechnicianOrderDetail']), inner = nested(plain);
  backFromParts(inner as any); expect(plain.goBack).not.toHaveBeenCalled(); expect(inner.goBack).toHaveBeenCalledTimes(1);
});
