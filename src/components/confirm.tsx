import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions use the red confirm button and focus Cancel by default. */
  tone?: 'default' | 'danger';
  /** Single-button notice instead of a question. */
  alertOnly?: boolean;
}

type Pending = (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;

let openDialog: ((next: NonNullable<Pending>) => void) | null = null;

function open(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!openDialog) {
      // No host mounted (should not happen): fall back to the browser dialog.
      resolve(window.confirm(options.message ? `${options.title}\n\n${options.message}` : options.title));
      return;
    }
    openDialog({ ...options, resolve });
  });
}

/** Promise-based themed replacement for window.confirm. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return open(options);
}

/** Promise-based themed replacement for window.alert. */
export function alertDialog(message: string, title = 'Heads up'): Promise<void> {
  return open({ title, message, alertOnly: true, confirmLabel: 'Got it' }).then(() => undefined);
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    openDialog = setPending;
    return () => {
      openDialog = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close(false);
      if (e.key === 'Enter') return close(pending.alertOnly || pending.tone !== 'danger');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  function close(ok: boolean) {
    const current = pending;
    setPending(null);
    current?.resolve(ok);
  }

  if (!pending) return null;

  const danger = pending.tone === 'danger';

  return createPortal(
    <div className="modal-backdrop confirm-backdrop" onClick={() => close(false)}>
      <div
        className="modal confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={pending.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{pending.title}</h2>
        {pending.message && <p className="confirm-message">{pending.message}</p>}
        <div className="modal-actions">
          {!pending.alertOnly && (
            <button className="btn" onClick={() => close(false)} autoFocus={danger}>
              {pending.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            className={`btn ${danger ? 'danger-solid' : 'primary'}`}
            onClick={() => close(true)}
            autoFocus={!danger}
          >
            {pending.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
