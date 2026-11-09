import { useState, type FormEvent } from 'react';
import { authErrorMessage, useAuth } from '../lib/auth';
import { Icon } from './Icon';
import { Logo } from './Logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'signin' | 'signup';

export function BackendNotice() {
  return (
    <div className="brand-notice">
      <div className="card">
        <Logo size={34} withWordmark />
        <h1>Walnut needs its backend</h1>
        <p className="auth-sub">
          Accounts and syncing run on Supabase. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env</code>, then restart the dev
          server.
        </p>
      </div>
    </div>
  );
}

export function AuthScreen({ initialMode = 'signin', onBack }: { initialMode?: Mode; onBack?: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(cleanEmail, password);
      } else {
        const { needsConfirmation } = await signUp(cleanEmail, password);
        if (needsConfirmation) setSentTo(cleanEmail);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <Logo size={38} tone="light" withWordmark />
        <div className="auth-brand-copy">
          <span className="eyebrow">Personal finance</span>
          <h1>
            Money,
            <br />
            sorted<span className="accent">.</span>
          </h1>
          <p>
            Needs, expenses and investments in one clear view — with every entry tied to your
            own account.
          </p>
        </div>
        <ul className="auth-points">
          <li>
            <span className="tick"><Icon name="grid" size={12} /></span>
            Three groups, one honest picture
          </li>
          <li>
            <span className="tick"><Icon name="users" size={12} /></span>
            Loans, budgets and recurring entries
          </li>
          <li>
            <span className="tick"><Icon name="wallet" size={12} /></span>
            Your data is private to your login
          </li>
        </ul>
        <p className="auth-brand-foot">Walnut · money, sorted</p>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          {onBack && (
            <button type="button" className="auth-back" onClick={onBack}>
              <Icon name="chevronLeft" size={14} /> Back to home
            </button>
          )}
          {sentTo ? (
            <div className="auth-done">
              <span className="auth-badge"><Icon name="check" size={20} /></span>
              <span className="eyebrow">Almost there</span>
              <h2>Confirm your email</h2>
              <p className="auth-sub">
                We sent a confirmation link to <strong>{sentTo}</strong>. Open it, then come back
                and sign in. Check spam if it hasn’t arrived in a minute.
              </p>
              <button
                type="button"
                className="btn primary auth-submit"
                onClick={() => {
                  setSentTo(null);
                  switchMode('signin');
                }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div>
                <span className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'New here'}</span>
                <h2>{mode === 'signin' ? 'Sign in to Walnut' : 'Create your account'}</h2>
                <p className="auth-sub">
                  {mode === 'signin'
                    ? 'Your budget is where you left it.'
                    : 'Email and password. Nothing else, ever.'}
                </p>
              </div>

              <div className="auth-tabs">
                <button
                  type="button"
                  className={`tab${mode === 'signin' ? ' active' : ''}`}
                  aria-pressed={mode === 'signin'}
                  onClick={() => switchMode('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`tab${mode === 'signup' ? ' active' : ''}`}
                  aria-pressed={mode === 'signup'}
                  onClick={() => switchMode('signup')}
                >
                  Create account
                </button>
              </div>

              <form className="auth-form" onSubmit={submit} noValidate>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    placeholder="you@example.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {mode === 'signup' && (
                  <label>
                    Confirm password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirm}
                      placeholder="Repeat your password"
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </label>
                )}

                {error && <p className="auth-error" role="alert">{error}</p>}

                <button className="btn primary auth-submit" type="submit" disabled={busy}>
                  {busy ? 'Just a moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              <p className="auth-fine">Email and password only. No social logins, no magic links.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
