import type { AppData, Transaction } from './types';

function missingIds<T extends { id: string }>(local: T[], remote: T[]): number {
  const remoteIds = new Set(remote.map((entry) => entry.id));
  return local.reduce((count, entry) => count + (remoteIds.has(entry.id) ? 0 : 1), 0);
}

/**
 * A detection removed on another device was discarded there. Auto-detected entries start as
 * machine guesses, so their disappearance is not the data loss this guard exists for — counting
 * them would show a false "cloud update removed an entry" banner on the other device.
 */
function missingTransactions(local: Transaction[], remote: Transaction[]): number {
  const remoteIds = new Set(remote.map((entry) => entry.id));
  return local.reduce((count, entry) => {
    if (remoteIds.has(entry.id)) return count;
    if (entry.source === 'auto_upi' && entry.reviewStatus !== 'confirmed') return count;
    return count + 1;
  }, 0);
}

/**
 * Counts records that exist locally but not in the incoming document. A non-zero result is
 * the signal to keep a rollback copy before applying the remote version; it is deliberately
 * conservative because a missing transaction is much worse than an unnecessary snapshot.
 */
export function missingEntryCount(local: AppData, remote: AppData): number {
  let missing = 0;
  missing += missingTransactions(local.transactions, remote.transactions);
  missing += missingIds(local.transfers, remote.transfers);
  missing += missingIds(local.loans, remote.loans);
  missing += missingIds(local.favors, remote.favors);
  missing += missingIds(local.favorPeople, remote.favorPeople);
  missing += missingIds(local.recurring, remote.recurring);
  missing += missingIds(local.assets, remote.assets);

  // A loan can survive while one of its repayments disappears, which also changes balances.
  for (const localLoan of local.loans) {
    const remoteLoan = remote.loans.find((loan) => loan.id === localLoan.id);
    if (!remoteLoan) continue;
    missing += missingIds(localLoan.repayments, remoteLoan.repayments);
  }

  return missing;
}
