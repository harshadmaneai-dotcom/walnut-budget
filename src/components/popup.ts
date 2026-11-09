import { useCallback, useEffect, useRef, useState } from 'react';

export interface PopupPos {
  left: number;
  top: number;
}

/**
 * Anchors a fixed-position popover under a trigger button. Portals are used so popovers are
 * never clipped by the modal's scroll container. Repositions on scroll/resize and closes on
 * an outside click.
 */
export function usePopup(popupWidth: number, estimatedHeight: number) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopupPos>({ left: 0, top: 0 });

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(
      Math.max(margin, r.left),
      Math.max(margin, window.innerWidth - popupWidth - margin),
    );
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow < estimatedHeight + 20 && r.top > estimatedHeight + 20
      ? Math.max(margin, r.top - estimatedHeight - 8)
      : r.bottom + 8;
    setPos({ left, top });
  }, [popupWidth, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, place]);

  return { triggerRef, popupRef, open, setOpen, pos, width: popupWidth };
}
