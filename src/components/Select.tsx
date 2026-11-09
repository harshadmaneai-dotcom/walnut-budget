import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopup } from './popup';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Themed dropdown. The native select popup is OS-rendered and cannot match the app theme. */
export function Select({ value, onChange, options, placeholder = 'Select', disabled, ariaLabel }: Props) {
  const { triggerRef, popupRef, open, setOpen, pos, width } = usePopup(240, 280);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) setActive(Math.max(0, selectedIndex));
  }, [open, selectedIndex]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + dir + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (open && options[active]) {
        e.preventDefault();
        choose(options[active].value);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <span className={`dd${open ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="dd-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={`dd-value${selectedIndex === -1 ? ' muted' : ''}`}>
          {selectedIndex >= 0 ? options[selectedIndex].label : placeholder}
        </span>
        <span className="dd-chev" aria-hidden="true">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popupRef}
            className="dd-pop"
            role="listbox"
            aria-label={ariaLabel}
            style={{ left: pos.left, top: pos.top, width }}
          >
            {options.length === 0 && <div className="dd-empty">No options</div>}
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dd-opt${o.value === value ? ' is-selected' : ''}${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {o.value === value && (
                  <span className="dd-check" aria-hidden="true">
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                      <path d="M1 4.5L4.2 7.7 11 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
