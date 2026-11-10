import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { backendConfigured, supabase } from './supabase';
import { WEB_ORIGIN } from './downloads';
import { clearCached, isDirty } from './storage';

export interface AuthState {
  /** Null until the stored session has been checked. */
  session: Session | null;
  user: User | null;
  /** True while the initial session lookup is in flight. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface SupabaseError {
  message?: string;
  status?: number;
  code?: string;
}

function errorOf(err: unknown): SupabaseError {
  if (err && typeof err === 'object') return err as SupabaseError;
  return { message: String(err) };
}

/** Turn Supabase auth errors into something a person can act on. */
export function authErrorMessage(err: unknown): string {
  const { message = '', status, code } = errorOf(err);
  const text = message.toLowerCase();

  if (text.includes('invalid login credentials')) return 'That email and password combination is not right.';
  if (text.includes('email not confirmed')) return 'Confirm your email address first — check your inbox for the link.';
  if (text.includes('user already registered') || code === 'user_already_exists') {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (text.includes('password should be at least') || code === 'weak_password') {
    return message.replace(/^.*?password should be at least/i, 'Password must be at least');
  }
  if (text.includes('unable to validate email') || text.includes('invalid email')) {
    return 'That email address does not look valid.';
  }
  if (status === 429 || text.includes('rate limit') || text.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (text.includes('signups not allowed')) return 'New sign-ups are disabled for this app.';
  return message || 'Something went wrong. Try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(backendConfigured);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Sign-in is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Sign-in is not configured.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.protocol === 'file:' ? WEB_ORIGIN : window.location.origin,
      },
    });
    if (error) throw error;
    // With email confirmation on, Supabase returns a user but no session.
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Only drop the local copy once the cloud has everything, so an offline edit is never
    // lost; and leaving nothing behind means a shared device shows no trace of the budget.
    if (userId && !isDirty(userId)) clearCached(userId);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, signIn, signUp, signOut }),
    [session, loading, signIn, signUp, signOut],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider.');
  return ctx;
}
