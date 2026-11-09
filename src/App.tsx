import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Loans } from './pages/Loans';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { ConfirmHost } from './components/confirm';
import { Icon, type IconName } from './components/Icon';
import { AuthProvider, useAuth } from './lib/auth';
import { AuthScreen, BackendNotice } from './components/AuthScreen';
import { Logo } from './components/Logo';
import { Landing } from './pages/Landing';
import { Tour } from './components/Tour';
import { UpdateBanner } from './components/UpdateBanner';
import { backendConfigured } from './lib/supabase';
import { isNativeShell } from './lib/platform';

export type Page = 'landing' | 'dashboard' | 'transactions' | 'loans' | 'reports' | 'settings';

const NAV: { id: Page; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Home', icon: 'grid' },
  { id: 'transactions', label: 'Activity', icon: 'swap' },
  { id: 'loans', label: 'Loans', icon: 'users' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

function pageFromHash(): Page {
  const h = window.location.hash.replace('#', '');
  if (h === 'landing') return 'landing';
  // The Android shell starts with no hash; open the app, not the marketing page.
  if (h === '') return isNativeShell() ? 'dashboard' : 'landing';
  return NAV.some((n) => n.id === h) ? (h as Page) : 'dashboard';
}

function Splash() {
  return (
    <div className="splash">
      <Logo size={42} withWordmark />
      <p className="splash-note">Loading your budget…</p>
    </div>
  );
}

function BudgetApp({ userId }: { userId: string }) {
  const store = useStore(userId);
  const [page, setPage] = useState<Page>(pageFromHash);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (page === 'landing') {
    return (
      <Landing
        signedIn
        onSignIn={() => {}}
        onCreate={() => {}}
        onOpenBudget={() => {
          window.location.hash = '#dashboard';
        }}
      />
    );
  }

  return (
    <div className="app">
      <aside className="rail" aria-label="Main navigation">
        <a className="rail-logo" href="#dashboard" aria-label="Walnut home">
          <Logo size={30} />
        </a>
        <div className="rail-group">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={`rail-link${n.id === page ? ' active' : ''}`}
              aria-label={n.label}
              aria-current={n.id === page ? 'page' : undefined}
              data-tour={n.id === 'dashboard' ? 'nav-home' : undefined}
            >
              <Icon name={n.icon} size={21} />
              <span className="rail-label">{n.label}</span>
            </a>
          ))}
        </div>
      </aside>
      <main className="main">
        <div className="mobile-brand">
          <Logo size={24} withWordmark />
        </div>
        {page === 'dashboard' && <Dashboard store={store} />}
        {page === 'transactions' && <Transactions store={store} />}
        {page === 'loans' && <Loans store={store} />}
        {page === 'reports' && <Reports store={store} />}
        {page === 'settings' && <Settings store={store} />}
      </main>
      {store.syncError && (
        <div className="sync-banner" role="status" aria-live="polite">
          <span className="sync-dot" aria-hidden="true" />
          <div className="sync-text">
            <strong>Not saved to the cloud</strong>
            <span>{store.syncError}</span>
          </div>
          <button className="btn small" onClick={store.retrySync}>Retry</button>
        </div>
      )}
      <Tour userId={userId} />
      <ConfirmHost />
    </div>
  );
}

type GuestRoute = 'landing' | 'signin' | 'signup';

/** Signed-out routes: the landing is its own page; sign-in and sign-up are separate pages; any app route redirects to sign-in. */
function guestRoute(): GuestRoute {
  const h = window.location.hash.replace('#', '');
  if (h === 'landing') return 'landing';
  // Signed out in the Android shell: show sign-in instead of the landing page.
  if (h === '') return isNativeShell() ? 'signin' : 'landing';
  if (h === 'signup') return 'signup';
  return 'signin';
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

/** Decides between the guest pages and the budget app. Each account gets its own store. */
function Gate() {
  const { user, loading } = useAuth();
  const hash = useHash();
  const wasGuest = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      wasGuest.current = true;
      // Signed-out visitors on an app route are sent to sign-in.
      const h = hash.replace('#', '');
      if (h !== '' && h !== 'landing' && h !== 'signin' && h !== 'signup') {
        window.location.hash = '#signin';
      }
    } else if (wasGuest.current) {
      // Signing in from the sign-in or sign-up page opens the app straight away.
      wasGuest.current = false;
      window.location.hash = '#dashboard';
    }
  }, [user, loading, hash]);

  if (!backendConfigured) return <BackendNotice />;
  if (loading) return <Splash />;
  if (!user) {
    const route = guestRoute();
    if (route === 'landing') {
      return (
        <Landing
          signedIn={false}
          onSignIn={() => {
            window.location.hash = '#signin';
          }}
          onCreate={() => {
            window.location.hash = '#signup';
          }}
          onOpenBudget={() => {}}
        />
      );
    }
    return (
      <AuthScreen
        key={route}
        initialMode={route === 'signup' ? 'signup' : 'signin'}
        onBack={() => {
          window.location.hash = '#landing';
        }}
      />
    );
  }
  return <BudgetApp key={user.id} userId={user.id} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
      <UpdateBanner />
    </AuthProvider>
  );
}
