import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { ANDROID_DOWNLOAD_URL, DESKTOP_DOWNLOAD_URL } from '../lib/downloads';

interface LandingProps {
  signedIn: boolean;
  onSignIn: () => void;
  onCreate: () => void;
  onOpenBudget: () => void;
}

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'grid', title: 'Three groups, one picture', text: 'Needs, wants and investments side by side, so you see where money really goes.' },
  { icon: 'users', title: 'Loans and repayments', text: 'Track money you lent or borrowed, with due dates and every repayment recorded.' },
  { icon: 'chart', title: 'Clear monthly reports', text: 'Spot trends across months and categories without building a spreadsheet.' },
  { icon: 'wallet', title: 'Private to your login', text: 'Your data is tied to your account and synced only for you.' },
];

const STEPS: { title: string; text: string }[] = [
  { title: 'Create your account', text: 'Sign up with an email and password. Nothing else is needed.' },
  { title: 'Add your accounts and categories', text: 'Start with your bank accounts and the groups that matter to you.' },
  { title: 'Log money as it moves', text: 'Record income and expenses in seconds, on any device.' },
];

export function Landing({ signedIn, onSignIn, onCreate, onOpenBudget }: LandingProps) {
  const isAndroid = /android/i.test(navigator.userAgent);
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo size={30} withWordmark />
        <div className="landing-nav-actions">
          {signedIn ? (
            <button className="btn primary small" onClick={onOpenBudget}>Open my budget</button>
          ) : (
            <>
              <button className="btn small" onClick={onSignIn}>Sign in</button>
              <button className="btn primary small" onClick={onCreate}>Create account</button>
            </>
          )}
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow">Personal finance</span>
          <h1>
            Money,
            <br />
            sorted<span className="accent">.</span>
          </h1>
          <p>
            Walnut brings your needs, expenses and investments into one clear view, with loans and
            monthly reports built in.
          </p>
          <div className="landing-cta">
            {signedIn ? (
              <button className="btn primary" onClick={onOpenBudget}>Open my budget</button>
            ) : (
              <>
                <button className="btn primary" onClick={onCreate}>Create account</button>
                <button className="btn" onClick={onSignIn}>Sign in</button>
              </>
            )}
          </div>
        </div>
        <div className="landing-hero-art" aria-hidden="true">
          <Logo size={180} tone="light" />
        </div>
      </section>

      <section className="landing-section">
        <span className="eyebrow">What you get</span>
        <h2>Everything in one honest view</h2>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <article className="landing-feature card" key={f.title}>
              <span className="dot-icon"><Icon name={f.icon} size={18} /></span>
              <h3>{f.title}</h3>
              <p className="muted">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <span className="eyebrow">How it works</span>
        <h2>Up and running in minutes</h2>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="landing-step-num">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p className="muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-download">
        <div>
          <span className="eyebrow">Apps</span>
          <h2>Take Walnut with you</h2>
          <p className="muted">
            The Windows app and the Android app sign in with the same account as the web app.
          </p>
          <p className="muted landing-fineprint">
            Android asks once whether to allow installs from your browser. That is normal for apps
            installed outside the Play Store.
          </p>
        </div>
        <div className="landing-cta">
          <a
            className="btn primary"
            href={isAndroid ? ANDROID_DOWNLOAD_URL : DESKTOP_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download for {isAndroid ? 'Android' : 'Windows'}
          </a>
          <a
            className="btn"
            href={isAndroid ? DESKTOP_DOWNLOAD_URL : ANDROID_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {isAndroid ? 'Windows version' : 'Android app (APK)'}
          </a>
          <button className="btn" onClick={signedIn ? onOpenBudget : onCreate}>
            {signedIn ? 'Open my budget' : 'Use it in the browser'}
          </button>
        </div>
      </section>

      <footer className="landing-foot">Walnut · money, sorted</footer>
    </div>
  );
}
