import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';

const REPLAY_EVENT = 'walnut:tour-replay';

type Step = {
  title: string;
  body: string;
  /** Hash route the step lives on. */
  route: 'dashboard' | 'transactions' | 'settings';
  /** CSS selector of the real element to spotlight. */
  target: string;
};

const STEPS: Step[] = [
  {
    title: 'Home',
    body: 'This is home. See your balance and this month at a glance.',
    route: 'dashboard',
    target: '[data-tour="nav-home"]',
  },
  {
    title: 'Categories',
    body: 'Categories live in Settings → Categories. Add, rename or remove them here.',
    route: 'settings',
    target: '[data-tour="categories"]',
  },
  {
    title: 'Three groups',
    body: 'Every category sits in one of three groups: Needs, Expenses or Investments. This card shows how your money splits across them.',
    route: 'dashboard',
    target: '[data-tour="groups"]',
  },
  {
    title: 'How categories work',
    body: 'Each expense category belongs to one group. Needs and expenses carry a monthly budget, so you can see how close you are to your limit.',
    route: 'settings',
    target: '[data-tour="categories"]',
  },
  {
    title: 'Adding entries',
    body: 'Record income and expenses with the Add transaction button on Activity.',
    route: 'transactions',
    target: '[data-tour="add-entry"]',
  },
  {
    title: 'Accounts',
    body: 'Your accounts live in Settings → Accounts. Each transaction is recorded against one of them.',
    route: 'settings',
    target: '[data-tour="accounts"]',
  },
  {
    title: 'Settings',
    body: 'Settings holds accounts, categories, recurring items, currency and backups. You can replay this walkthrough from the Walkthrough card here.',
    route: 'settings',
    target: '[data-tour="walkthrough"]',
  },
];

const doneKey = (userId: string) => `walnut:tour-done:${userId}`;

/** Opens the walkthrough again from anywhere in the app (used by Settings). */
export function replayTour() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

type Box = { top: number; left: number; width: number; height: number };

function measure(selector: string): Box | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Spotlight walkthrough. Shows once per account after first sign-in, and on replay. */
export function Tour({ userId }: { userId: string }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(doneKey(userId)) !== '1';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const onReplay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  const current = STEPS[step];

  // Move to the step's page, then measure its target once it has rendered.
  useLayoutEffect(() => {
    if (!open) return;
    if (window.location.hash !== `#${current.route}`) {
      window.location.hash = `#${current.route}`;
    }
    let tries = 0;
    let timer = 0;
    const find = () => {
      const b = measure(current.target);
      if (b || tries++ > 30) {
        setBox(b);
      } else {
        timer = window.setTimeout(find, 60);
      }
    };
    setBox(null);
    find();
    return () => window.clearTimeout(timer);
  }, [open, step, current.route, current.target]);

  // Keep the spotlight in place when the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const update = () => setBox(measure(current.target));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, current.target]);

  if (!open) return null;

  function finish() {
    try {
      localStorage.setItem(doneKey(userId), '1');
    } catch {
      /* storage unavailable: the tour simply may show again */
    }
    setOpen(false);
  }

  const last = step === STEPS.length - 1;
  const pad = 8;
  const mobile = window.innerWidth <= 760;

  // Desktop: tooltip beside the target. Mobile: bottom sheet (CSS). No target: centred card.
  let tipStyle: CSSProperties = {};
  if (!mobile && box) {
    const tipWidth = 320;
    const left = Math.min(Math.max(12, box.left + box.width + 18), window.innerWidth - tipWidth - 12);
    const top = Math.min(Math.max(12, box.top), window.innerHeight - 260);
    tipStyle = { top, left, width: tipWidth };
  }
  const centred = mobile || !box;

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? (
        <div
          className="tour-spot"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}
      <div className={`tour-card${centred ? ' sheet' : ''}`} style={tipStyle}>
        <div className="tour-progress" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`tour-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>
        <span className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </span>
        <h2 id="tour-title">{current.title}</h2>
        <p>{current.body}</p>
        <div className="tour-actions">
          <button className="btn small ghost" onClick={finish}>
            Skip
          </button>
          <div className="tour-nav">
            <button className="btn small" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              Back
            </button>
            <button
              className="btn small primary"
              onClick={last ? finish : () => setStep((s) => s + 1)}
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
