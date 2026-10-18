import { wholeVnd } from '../../api/customer-wallet.api';
import type { CustomerWithdrawal, CustomerWithdrawalHistory, CustomerWithdrawalInfo } from '../../api/customer-withdrawal.api';

/** Only a new record matching the frozen amount and saved destination resolves a lost POST acknowledgement. */
export function findNewCustomerWithdrawal(input: {
  history: CustomerWithdrawalHistory;
  info: CustomerWithdrawalInfo;
  previousIds: readonly string[];
  amount: number;
}): CustomerWithdrawal | null {
  const account = input.info.bankAccount;
  if (!account || !Number.isSafeInteger(input.amount) || input.amount <= 0) return null;
  const previous = new Set(input.previousIds);
  const unique = new Map<string, CustomerWithdrawal>();
  for (const item of [...input.history.data, ...(input.info.openWithdrawal ? [input.info.openWithdrawal] : [])]) {
    unique.set(item.id, item);
  }
  const matching = [...unique.values()].filter(item => !previous.has(item.id)
    && wholeVnd(item.amount) === input.amount
    && item.bankName === account.bankName
    && item.bankAccountName === account.accountName
    && item.bankAccountNumber?.slice(-4) === account.accountNumber.slice(-4));
  return matching.length === 1 ? matching[0] : null;
}
