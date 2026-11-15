import type { AppData, Loan, Repayment, Transaction, Transfer } from './types';

/**
 * One row in the activity feed. Repayments are read-only here: the loan itself owns their
 * edit/delete flow, so a ledger row cannot silently change a loan's schedule.
 */
export type ActivityEntry =
  | { kind: 'transaction'; id: string; date: string; createdAt?: string; tx: Transaction }
  | { kind: 'transfer'; id: string; date: string; createdAt?: string; transfer: Transfer }
  | { kind: 'repayment'; id: string; date: string; loan: Loan; repayment: Repayment };

export interface ActivityResult {
  entries: ActivityEntry[];
  /** Every transaction, transfer and repayment, including the entries not shown. */
  total: number;
  /** How many entries are hidden by the limit. */
  hidden: number;
}

type Candidate = ActivityEntry & {
  /** Used only for ordering. Higher is newer. */
  sortAt: number;
  /** Position in the source array; breaks same-day ties for legacy records. */
  order: number;
  /** Transactions before repayments before transfers when their timestamps tie. */
  rank: number;
};

/** Local midnight for a stored YYYY-MM-DD date. */
function dateStart(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return 0;
  const value = new Date(year, month - 1, day).getTime();
  return Number.isFinite(value) ? value : 0;
}

/**
 * New records carry createdAt. Older records predate it, so their date is the best available
 * timestamp; using the start of that day keeps any record created later that day above them.
 */
function effectiveTime(createdAt: string | undefined, date: string): number {
  if (createdAt) {
    const parsed = Date.parse(createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return dateStart(date);
}

/**
 * The newest activity first. Date/creation time is primary; when two records share it, the
 * one added last wins. That is what prevents the dashboard cap from hiding the transaction
 * a user just added alongside several older entries from the same day.
 */
export function buildActivity(data: AppData, limit = 10): ActivityResult {
  const candidates: Candidate[] = [];

  data.transactions.forEach((tx, index) => {
    candidates.push({
      kind: 'transaction',
      id: tx.id,
      date: tx.date,
      createdAt: tx.createdAt,
      tx,
      sortAt: effectiveTime(tx.createdAt, tx.date),
      order: index,
      rank: 2,
    });
  });

  data.transfers.forEach((transfer, index) => {
    candidates.push({
      kind: 'transfer',
      id: transfer.id,
      date: transfer.date,
      createdAt: transfer.createdAt,
      transfer,
      sortAt: effectiveTime(transfer.createdAt, transfer.date),
      order: index,
      rank: 0,
    });
  });

  data.loans.forEach((loan) => {
    loan.repayments.forEach((repayment, index) => {
      candidates.push({
        kind: 'repayment',
        id: repayment.id,
        date: repayment.date,
        loan,
        repayment,
        sortAt: dateStart(repayment.date),
        order: index,
        rank: 1,
      });
    });
  });

  candidates.sort((a, b) => {
    if (a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;
    if (a.order !== b.order) return b.order - a.order;
    if (a.rank !== b.rank) return b.rank - a.rank;
    return b.id.localeCompare(a.id);
  });

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : candidates.length;
  return {
    entries: candidates.slice(0, safeLimit),
    total: candidates.length,
    hidden: Math.max(0, candidates.length - safeLimit),
  };
}
