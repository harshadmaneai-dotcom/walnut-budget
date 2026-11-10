import { describe, expect, it } from 'vitest';
import { transactionsToCsv } from './csv';
import { defaultData } from './storage';
import type { AppData } from './types';

function withNote(note: string): AppData {
  const data = defaultData();
  return {
    ...data,
    transactions: [
      {
        id: 't1',
        type: 'expense',
        amount: 12_50,
        date: '2026-11-01',
        categoryId: 'c-food',
        accountId: 'a-cash',
        note,
      },
    ],
  };
}

function noteCell(csv: string): string {
  const lines = csv.split('\n');
  return lines[lines.length - 1].split(',').slice(-1)[0];
}

describe('transactionsToCsv', () => {
  it('writes a header and one row per transaction', () => {
    const csv = transactionsToCsv(withNote('Coffee'));
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv.startsWith('date,type,amount')).toBe(true);
    expect(csv).toContain('12.50');
  });

  it('quotes notes containing separators', () => {
    expect(transactionsToCsv(withNote('Lunch, then coffee'))).toContain('"Lunch, then coffee"');
  });

  it('neutralises notes a spreadsheet would run as a formula', () => {
    expect(noteCell(transactionsToCsv(withNote('=1+1')))).toBe("'=1+1");
    expect(noteCell(transactionsToCsv(withNote('@SUM(A1)')))).toBe("'@SUM(A1)");
    expect(noteCell(transactionsToCsv(withNote('-2+3')))).toBe("'-2+3");
    expect(noteCell(transactionsToCsv(withNote('+HYPERLINK(1)')))).toBe("'+HYPERLINK(1)");
  });

  it('leaves ordinary text alone', () => {
    expect(noteCell(transactionsToCsv(withNote('Rent for November')))).toBe('Rent for November');
  });
});
