import { describe, expect, it } from 'vitest';
import { defaultData, normalizeData } from './storage';
import type { AppData } from './types';
import {
  confirmDetected,
  detectedFromItem,
  discardDetected,
  isNeedsReview,
  mergeDetected,
  needsReviewCount,
  upiTransactionId,
  type DetectedUpiPayment,
} from './upi';

function payment(overrides: Partial<DetectedUpiPayment> = {}): DetectedUpiPayment {
  return {
    key: 'com.google.android.apps.nbu.paisa.user|1763000000000|25000|Sharma Store',
    amount: 250_00,
    merchant: 'Sharma Store',
    date: '2026-11-13',
    detectedAt: '2026-11-13T09:33:20.000Z',
    sourceApp: 'gpay',
    ...overrides,
  };
}

describe('detectedFromItem', () => {
  it('keeps the phone local date and the exact amount', () => {
    const detected = detectedFromItem({
      key: 'k',
      amount: 125050,
      merchant: ' ABC Traders ',
      postTime: new Date(2026, 10, 13, 21, 5).getTime(),
      sourceApp: 'phonepe',
    });
    expect(detected?.amount).toBe(125050);
    expect(detected?.merchant).toBe('ABC Traders');
    expect(detected?.date).toBe('2026-11-13');
  });

  it('rejects a payload that cannot be an expense', () => {
    expect(detectedFromItem({ key: '', amount: 100, merchant: 'x', postTime: 0, sourceApp: 'gpay' })).toBeNull();
    expect(detectedFromItem({ key: 'k', amount: 0, merchant: 'x', postTime: 0, sourceApp: 'gpay' })).toBeNull();
    expect(detectedFromItem({ key: 'k', amount: NaN, merchant: 'x', postTime: 0, sourceApp: 'gpay' })).toBeNull();
  });
});

describe('mergeDetected', () => {
  const base: AppData = defaultData();

  it('adds an unreviewed expense in the chosen account', () => {
    const { data, accepted } = mergeDetected(base, [payment()]);
    expect(accepted).toHaveLength(1);
    expect(data.transactions).toHaveLength(1);
    const tx = data.transactions[0];
    expect(tx.type).toBe('expense');
    expect(tx.amount).toBe(250_00);
    expect(tx.note).toBe('Sharma Store');
    expect(tx.source).toBe('auto_upi');
    expect(tx.sourceApp).toBe('gpay');
    expect(tx.reviewStatus).toBe('needs_review');
    expect(tx.categoryId).toBe('c-other-exp');
    expect(tx.accountId).toBe(base.accounts[0].id);
    expect(isNeedsReview(tx)).toBe(true);
    expect(needsReviewCount(data)).toBe(1);
  });

  it('is idempotent for the same notification', () => {
    const first = mergeDetected(base, [payment()]);
    const second = mergeDetected(first.data, [payment()]);
    expect(second.accepted).toHaveLength(0);
    expect(second.data.transactions).toHaveLength(1);
  });

  it('accepts two identical payments captured at different times', () => {
    const later = payment({ key: 'com.phonepe.app|1763000600000|25000|Sharma Store' });
    const { data } = mergeDetected(base, [payment(), later]);
    expect(data.transactions).toHaveLength(2);
  });

  it('never recreates a discarded detection', () => {
    const { data } = mergeDetected(base, [payment()]);
    const discarded = discardDetected(data, data.transactions[0].id);
    expect(discarded.transactions).toHaveLength(0);
    expect(discarded.upiIgnored).toEqual([payment().key]);

    const again = mergeDetected(discarded, [payment()]);
    expect(again.accepted).toHaveLength(0);
    expect(again.data.transactions).toHaveLength(0);
  });

  it('confirms without losing the auto marker', () => {
    const { data } = mergeDetected(base, [payment()]);
    const confirmed = confirmDetected(data, data.transactions[0].id);
    expect(confirmed.transactions[0].reviewStatus).toBe('confirmed');
    expect(confirmed.transactions[0].source).toBe('auto_upi');
    expect(needsReviewCount(confirmed)).toBe(0);
  });

  it('uses the account picked in settings, and ignores a deleted one', () => {
    const withAccount: AppData = {
      ...base,
      accounts: [...base.accounts, { id: 'a-bank', name: 'Bank', kind: 'bank', openingBalance: 0 }],
      settings: { ...base.settings, upiAccountId: 'a-bank' },
    };
    expect(mergeDetected(withAccount, [payment()]).data.transactions[0].accountId).toBe('a-bank');
    const deleted: AppData = { ...withAccount, settings: { ...withAccount.settings, upiAccountId: 'gone' } };
    expect(mergeDetected(deleted, [payment()]).data.transactions[0].accountId).toBe(base.accounts[0].id);
  });

  it('does nothing when there is no expense category at all', () => {
    const incomeOnly: AppData = {
      ...base,
      categories: base.categories.filter((c) => c.type === 'income'),
    };
    expect(mergeDetected(incomeOnly, [payment()]).accepted).toHaveLength(0);
  });

  it('rejects a malformed date or amount from the bridge', () => {
    const { accepted } = mergeDetected(base, [
      payment({ date: '13-11-2026' }),
      payment({ key: 'other', amount: 0 }),
    ]);
    expect(accepted).toHaveLength(0);
  });

  it('derives the same id on every run', () => {
    expect(upiTransactionId('abc')).toBe(upiTransactionId('abc'));
    expect(upiTransactionId('abc')).not.toBe(upiTransactionId('abd'));
  });

  it('caps the discarded-key memory', () => {
    let data: AppData = base;
    for (let i = 0; i < 210; i += 1) {
      data = mergeDetected(data, [payment({ key: `k-${i}` })]).data;
      const tx = data.transactions[data.transactions.length - 1];
      data = discardDetected(data, tx.id);
    }
    expect(data.upiIgnored).toHaveLength(200);
    expect(data.upiIgnored?.[199]).toBe('k-209');
  });
});

describe('normalizeData', () => {
  it('keeps the auto-tracking fields instead of stripping them', () => {
    const { data } = mergeDetected(defaultData(), [payment()]);
    const roundTripped = normalizeData(JSON.parse(JSON.stringify(data)));
    const tx = roundTripped.transactions[0];
    expect(tx.source).toBe('auto_upi');
    expect(tx.sourceApp).toBe('gpay');
    expect(tx.reviewStatus).toBe('needs_review');
    expect(tx.upiKey).toBe(payment().key);
    expect(tx.detectedAt).toBe(payment().detectedAt);
    expect(roundTripped.upiIgnored).toEqual([]);
  });

  it('keeps the chosen account and the discarded keys', () => {
    const doc = {
      ...defaultData(),
      settings: { ...defaultData().settings, upiAccountId: 'a-bank' },
      upiIgnored: ['a', 'a', '', 42, 'b'],
    } as unknown as AppData;
    const normalized = normalizeData(doc);
    expect(normalized.settings.upiAccountId).toBe('a-bank');
    expect(normalized.upiIgnored).toEqual(['a', 'b']);
  });
});
