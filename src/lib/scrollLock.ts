/**
 * Ref-counted body scroll lock for dialogs.
 *
 * Fixing the body (rather than only hiding its overflow) is what stops the page behind a
 * modal from moving on a desktop wheel or a phone touch. The exact scroll offset is saved
 * and restored when the last dialog closes, so the page never jumps.
 */

interface SavedBody {
  scrollY: number;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  paddingRight: string;
}

let locks = 0;
let saved: SavedBody | null = null;

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  locks += 1;
  if (locks > 1 || saved) return;

  const body = document.body;
  // A classic scrollbar disappears when the body is fixed; reserve its width so the
  // layout behind the dialog does not shift sideways.
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;

  saved = {
    scrollY: window.scrollY,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
  };

  body.style.position = 'fixed';
  body.style.top = `-${saved.scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

export function unlockScroll(): void {
  if (typeof document === 'undefined' || locks === 0) return;
  locks -= 1;
  if (locks > 0 || !saved) return;

  const body = document.body;
  const scrollY = saved.scrollY;
  const previous = saved;
  saved = null;

  body.style.position = previous.position;
  body.style.top = previous.top;
  body.style.left = previous.left;
  body.style.right = previous.right;
  body.style.width = previous.width;
  body.style.overflow = previous.overflow;
  body.style.paddingRight = previous.paddingRight;

  window.scrollTo(0, scrollY);
}
