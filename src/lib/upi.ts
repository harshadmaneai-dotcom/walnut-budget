import { UPI_IGNORED_LIMIT } from './storage';
import type { AppData, Transaction } from './types';

/** Where a detected payment lands until the user reviews it: "Other" when it exists. */
export const AUTO_UPI_CATEGORY_ID = 'c-other-exp';

/**
 * What the native listener hands over. It is already parsed: no notification text crosses the
 * bridge, only the fields a transaction needs.
 */
export interface NativeUpiItem {
  /** Identity of the notification; also what a discard remembers. */
  key: string;
  /** Integer paise, as the app stores every amount. */
  amount: number;
  merchant: string;
  /** Epoch milliseconds of the notification. */
  postTime: number;
  /** gpay, phonepe, paytm, bhim or amazonpay. */
  sourceApp: string;
}

/** A native item resolved into the date and timestamp the document uses. */
export interface DetectedUpiPayment {
  key: string;
  amount: number;
  merchant: string;
  /** YYYY-MM-DD in the phone's own timezone, which is where the payment happened. */
  date: string;
  detectedAt: string;
  sourceApp: string;
}

const SOURCE_LABELS: Record<string, string> = {
  gpay: 'GPay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  bhim: 'BHIM',
  amazonpay: 'Amazon Pay',
};

export function sourceAppLabel(sourceApp: string | undefined): string {
  if (!sourceApp) return 'UPI';
  return SOURCE_LABELS[sourceApp] ?? 'UPI';
}

/**
 * Stable id for one notification. Two devices must derive the same id from the same key, or a
 * re-delivery would create a second expense; two FNV-1a passes make a collision unlikely enough
 * that the id itself is the dedupe.
 */
export function upiTransactionId(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `upi-${a.toString(36)}${b.toString(36)}`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date (not UTC), because the phone's day is the user's day. */
function localDateOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Turns a bridge payload into a payment, or null when it cannot become a sane transaction. */
export function detectedFromItem(item: NativeUpiItem): DetectedUpiPayment | null {
  if (!item || typeof item.key !== 'string' || !item.key) return null;
  if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
    return null;
  }
  const ms = typeof item.postTime === 'number' && Number.isFinite(item.postTime)
    ? item.postTime
    : Date.now();
  return {
    key: item.key,
    amount: Math.round(item.amount),
    merchant: typeof item.merchant === 'string' ? item.merchant.trim().slice(0, 80) : '',
    date: localDateOf(ms),
    detectedAt: new Date(ms).toISOString(),
    sourceApp: typeof item.sourceApp === 'string' ? item.sourceApp : '',
  };
}

/** The category every new detection uses until the user edits it. */
export function autoCategoryId(data: AppData): string | null {
  const preferred = data.categories.find(
    (c) => c.id === AUTO_UPI_CATEGORY_ID && c.type === 'expense',
  );
  if (preferred) return preferred.id;
  return data.categories.find((c) => c.type === 'expense')?.id ?? null;
}

/** The account detections are recorded against; the document always has at least one. */
export function autoAccountId(data: AppData): string | null {
  const chosen = data.settings.upiAccountId;
  if (chosen && data.accounts.some((a) => a.id === chosen)) return chosen;
  return data.accounts[0]?.id ?? null;
}

export interface MergeResult {
  data: AppData;
  accepted: DetectedUpiPayment[];
}

/**
 * Adds detections as unreviewed expenses. Idempotent: the deterministic id means a notification
 * drained twice, by two devices, or after a crash mid-merge produces exactly one transaction.
 */
export function mergeDetected(data: AppData, items: DetectedUpiPayment[]): MergeResult {
  if (!items.length) return { data, accepted: [] };

  const ignored = new Set(data.upiIgnored ?? []);
  const knownIds = new Set(data.transactions.map((t) => t.id));
  const categoryId = autoCategoryId(data);
  const accountId = autoAccountId(data);
  // Without an expense category there is nowhere to file the entry; the app always has one.
  if (!categoryId) return { data, accepted: [] };

  const accepted: DetectedUpiPayment[] = [];
  const created: Transaction[] = [];

  for (const item of items) {
    if (!item.key || ignored.has(item.key)) continue;
    if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
    if (!ISO_DATE_RE.test(item.date)) continue;

    const id = upiTransactionId(item.key);
    if (knownIds.has(id)) continue;
    knownIds.add(id);

    const merchant = item.merchant || 'UPI payment';
    created.push({
      id,
      type: 'expense',
      amount: Math.round(item.amount),
      date: item.date,
      categoryId,
      accountId,
      note: merchant,
      createdAt: item.detectedAt,
      source: 'auto_upi',
      sourceApp: item.sourceApp,
      reviewStatus: 'needs_review',
      detectedAt: item.detectedAt,
      upiKey: item.key,
    });
    accepted.push({ ...item, merchant });
  }

  if (!created.length) return { data, accepted: [] };
  return {
    data: { ...data, transactions: [...data.transactions, ...created] },
    accepted,
  };
}

/** An auto-detected entry the user has not confirmed or discarded yet. */
export function isNeedsReview(tx: Transaction): boolean {
  return tx.source === 'auto_upi' && tx.reviewStatus === 'needs_review';
}

export function needsReviewCount(data: AppData): number {
  return data.transactions.filter(isNeedsReview).length;
}

/** One tap keeps the entry and stops it asking; the auto badge stays for transparency. */
export function confirmDetected(data: AppData, id: string): AppData {
  return {
    ...data,
    transactions: data.transactions.map((t) =>
      t.id === id && t.source === 'auto_upi' ? { ...t, reviewStatus: 'confirmed' } : t,
    ),
  };
}

/**
 * Discarding removes the expense and remembers its notification key, so a re-posted
 * notification cannot recreate what the user just rejected.
 */
export function discardDetected(data: AppData, id: string): AppData {
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx) return data;
  const ignored = [...(data.upiIgnored ?? [])];
  if (tx.upiKey && !ignored.includes(tx.upiKey)) ignored.push(tx.upiKey);
  return {
    ...data,
    transactions: data.transactions.filter((t) => t.id !== id),
    upiIgnored: ignored.slice(-UPI_IGNORED_LIMIT),
  };
}
