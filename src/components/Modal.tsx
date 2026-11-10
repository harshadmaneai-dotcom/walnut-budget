import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lockScroll, unlockScroll } from '../lib/scrollLock';

export type ModalClose = () => void;

interface ModalProps {
  title: string;
  onClose: () => void;
  /**
   * A function child receives the animated close, so a save or cancel handler can let the
   * exit play before the parent unmounts the dialog.
   */
  children: ReactNode | ((close: ModalClose) => ReactNode);
}

/** Kept in step with --dur-exit in styles.css. */
const EXIT_MS = 160;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Turns the sheet's own scroll into a small elastic pull when there is nothing to scroll
 * (or at an edge), and leaves normal scrolling alone when the content really overflows.
 * Native listeners are required because preventDefault does not work from React's passive
 * touchmove/wheel handlers.
 */
function useElasticScroll(ref: { readonly current: HTMLDivElement | null }, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || reducedMotion()) return;

    let startY = 0;
    let dragging = false;
    let offset = 0;
    let wheelOffset = 0;
    let wheelTimer = 0;
    let settleTimer = 0;

    const canScroll = () => el.scrollHeight - el.clientHeight > 1;
    const atTop = () => el.scrollTop <= 0;
    const atBottom = () => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 1;

    const apply = (y: number) => {
      el.style.transform = y === 0 ? '' : `translate3d(0, ${y.toFixed(2)}px, 0)`;
    };

    const damp = (delta: number, limit: number, factor: number) =>
      Math.sign(delta) * Math.min(limit, Math.abs(delta) * factor);

    const springBack = (duration = 320) => {
      el.style.transition = `transform ${duration}ms cubic-bezier(.22, 1.2, .36, 1)`;
      apply(0);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        el.style.transition = '';
      }, duration + 40);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      dragging = true;
      offset = 0;
      el.style.transition = 'none';
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!dragging || event.touches.length !== 1) return;
      const delta = event.touches[0].clientY - startY;
      const overflow = !canScroll() || (atTop() && delta > 0) || (atBottom() && delta < 0);
      if (!overflow) {
        if (offset !== 0) {
          offset = 0;
          apply(0);
        }
        return;
      }
      // The sheet takes the gesture; the locked page underneath never moves.
      event.preventDefault();
      offset = damp(delta, 54, 0.42);
      apply(offset);
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (offset !== 0) springBack();
      offset = 0;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const overflow = !canScroll() || (atTop() && event.deltaY < 0) || (atBottom() && event.deltaY > 0);
      if (!overflow) return;
      event.preventDefault();
      // Wheel down moves content up, so the sheet gives upward, matching the page's motion.
      wheelOffset = Math.max(-9, Math.min(9, wheelOffset - event.deltaY * 0.05));
      el.style.transition = 'none';
      apply(wheelOffset);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelOffset = 0;
        springBack(220);
      }, 110);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(wheelTimer);
      window.clearTimeout(settleTimer);
      el.style.transform = '';
      el.style.transition = '';
    };
  }, [ref, enabled]);
}

export function Modal({ title, onClose, children }: ModalProps) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const requested = useRef(false);

  const close = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setClosing(true);
    timer.current = window.setTimeout(() => onClose(), reducedMotion() ? 0 : EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // An open picker or confirm dialog owns Escape, not the sheet underneath it.
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('.dd-pop, .dp-pop, .confirm-backdrop')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useElasticScroll(sheetRef, !closing);

  return createPortal(
    <div className={`modal-backdrop${closing ? ' is-closing' : ''}`} onClick={close}>
      <div className="modal-frame">
        <div
          ref={sheetRef}
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
        >
          <h2>{title}</h2>
          {typeof children === 'function' ? children(close) : children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
