export const DEFAULT_CURRENCY = 'INR';

const CURRENCY_CODE_RE = /^[A-Za-z]{3}$/;

function safeCode(currency: string): string {
  return CURRENCY_CODE_RE.test(currency ?? '') ? currency.toUpperCase() : DEFAULT_CURRENCY;
}

const symbolCache = new Map<string, string>();

/** Display symbol for a currency code (₹ for INR, $ for USD). Falls back to the code. */
export function currencySymbol(currency: string): string {
  const code = safeCode(currency);
  const cached = symbolCache.get(code);
  if (cached) return cached;
  let symbol = code;
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(0);
    symbol = parts.find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    // Unknown code: show the code itself rather than crashing.
  }
  symbolCache.set(code, symbol);
  return symbol;
}

/** Format cents as money. Falls back to the default currency for an invalid/partial code. */
export function formatMoney(cents: number, currency: string): string {
  const code = safeCode(currency);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(cents / 100);
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`;
  }
}

/** Parse a user-typed amount like "12.50" into cents. Returns NaN when invalid. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100);
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
}
