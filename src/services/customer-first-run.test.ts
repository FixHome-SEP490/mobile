// src/services/customer-first-run.test.ts
import {
  CUSTOMER_FIRST_RUN_KEY,
  hasSeenCustomerFirstRun,
  markCustomerFirstRunSeen,
  resetCustomerFirstRunMemory,
  type CustomerFirstRunStorage,
} from './customer-first-run';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

function makeFake(initial: Record<string, string> = {}): CustomerFirstRunStorage & {
  values: Record<string, string>;
} {
  const values: Record<string, string> = { ...initial };
  return {
    values,
    getItem: async (key: string) => values[key] ?? null,
    setItem: async (key: string, value: string) => {
      values[key] = value;
    },
  };
}

beforeEach(() => {
  resetCustomerFirstRunMemory();
});

describe('customer-first-run flag', () => {
  it('defaults to unseen when nothing is stored', async () => {
    await expect(hasSeenCustomerFirstRun(makeFake())).resolves.toBe(false);
  });

  it('reads seen after mark persists the versioned key', async () => {
    const storage = makeFake();
    await markCustomerFirstRunSeen(storage);
    expect(storage.values[CUSTOMER_FIRST_RUN_KEY]).toBe('1');
    await expect(hasSeenCustomerFirstRun(storage)).resolves.toBe(true);
  });

  it('treats other stored values as unseen', async () => {
    resetCustomerFirstRunMemory();
    await expect(hasSeenCustomerFirstRun(makeFake({ [CUSTOMER_FIRST_RUN_KEY]: '0' }))).resolves.toBe(false);
  });

  it('failed storage read defaults to unseen', async () => {
    const failing: CustomerFirstRunStorage = {
      getItem: async () => {
        throw new Error('disk unavailable');
      },
      setItem: async () => undefined,
    };
    await expect(hasSeenCustomerFirstRun(failing)).resolves.toBe(false);
  });

  it('failed write still advances in memory', async () => {
    const failingWrite: CustomerFirstRunStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error('disk unavailable');
      },
    };
    await markCustomerFirstRunSeen(failingWrite);
    await expect(hasSeenCustomerFirstRun(makeFake())).resolves.toBe(true);
  });
});
