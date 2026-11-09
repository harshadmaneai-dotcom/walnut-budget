import { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopup } from './popup';
import { formatDate, todayISO } from '../lib/format';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  /** 1 = Monday, 0 = Sunday */
  weekStartsOn?: 0 | 1;
}

const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(value: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

function monthCells(y: number, m: number, weekStart: number): (number | null)[] {
  const lead = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Themed calendar popover, replacing the unthemed native date input picker. */
export function DatePicker({ value, onChange, placeholder = 'Select date', clearable = true, weekStartsOn = 1 }: Props) {
  const { triggerRef, popupRef, open, setOpen, pos } = usePopup(276, 344);
  const today = todayISO();
  const base = parse(value) ?? parse(today)!;
  const [view, setView] = useState({ y: base.y, m: base.m });

  function toggle() {
    if (!open) setView({ y: base.y, m: base.m });
    setOpen(!open);
  }

  function shift(delta: number) {
    const next = new Date(view.y, view.m + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  }

  function pick(day: number) {
    onChange(toISO(view.y, view.m, day));
    setOpen(false);
  }

  const cells = monthCells(view.y, view.m, weekStartsOn);
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEK[(weekStartsOn + i) % 7]);
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <span className={`dp${open ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="dp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="dp-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <rect x="1.6" y="3" width="12.8" height="11.4" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M1.6 6.6h12.8M5.2 1.6v2.6M10.8 1.6v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className={`dp-value${value ? '' : ' muted'}`}>{value ? formatDate(value) : placeholder}</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popupRef}
            className="dp-pop"
            role="dialog"
            aria-label="Choose a date"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="dp-head">
              <button type="button" className="dp-nav" onClick={() => shift(-1)} aria-label="Previous month">
                ‹
              </button>
              <span className="dp-label">{monthLabel}</span>
              <button type="button" className="dp-nav" onClick={() => shift(1)} aria-label="Next month">
                ›
              </button>
            </div>

            <div className="dp-week">
              {weekdays.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="dp-grid">
              {cells.map((day, i) =>
                day === null ? (
                  <span key={`b${i}`} />
                ) : (
                  <button
                    key={day}
                    type="button"
                    className={`dp-day${toISO(view.y, view.m, day) === value ? ' is-selected' : ''}${
                      toISO(view.y, view.m, day) === today ? ' is-today' : ''
                    }`}
                    aria-pressed={toISO(view.y, view.m, day) === value}
                    onClick={() => pick(day)}
                  >
                    {day}
                  </button>
                ),
              )}
            </div>

            <div className="dp-foot">
              <button
                type="button"
                className="dp-link"
                onClick={() => {
                  onChange(today);
                  setOpen(false);
                }}
              >
                Today
              </button>
              {clearable && value && (
                <button
                  type="button"
                  className="dp-link muted"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
