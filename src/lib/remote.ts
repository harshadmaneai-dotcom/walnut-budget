import type { AppData } from './types';
import { supabase } from './supabase';

/** One row per account. RLS on the table restricts every operation to auth.uid(). */
export const DATA_TABLE = 'walnut_data';

export const remoteEnabled = Boolean(supabase);

export interface RemoteDocument {
  data: AppData;
  updatedAt: string;
}

interface RemoteError {
  message?: string;
  code?: string;
  details?: string;
}

function isMissingTable(err: RemoteError): boolean {
  const text = `${err.code ?? ''} ${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    text.includes('does not exist') ||
    text.includes('could not find the table')
  );
}

function toMessage(err: unknown): Error {
  if (err && typeof err === 'object') {
    const remote = err as RemoteError;
    if (isMissingTable(remote)) {
      return new Error('The Walnut database is not set up yet. Run the SQL migration in Supabase.');
    }
    if (remote.message) return new Error(remote.message);
  }
  return new Error(String(err));
}

export async function fetchRemote(userId: string): Promise<RemoteDocument | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(DATA_TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toMessage(error);
  if (!data || data.data == null) return null;
  return {
    data: data.data as AppData,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : '',
  };
}

/**
 * A tiny read used by the live-sync poll. It never transfers the budget document, only the
 * server timestamp that changes when another device writes it.
 */
export async function fetchRemoteTimestamp(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(DATA_TABLE)
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toMessage(error);
  return typeof data?.updated_at === 'string' ? data.updated_at : null;
}

/** Saves the document and returns the server's timestamp for the row. */
export async function saveRemote(userId: string, doc: AppData): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(DATA_TABLE)
    .upsert({
      user_id: userId,
      version: doc.version,
      data: doc,
      updated_at: new Date().toISOString(),
    })
    .select('updated_at')
    .single();
  if (error) throw toMessage(error);
  return typeof data?.updated_at === 'string' ? data.updated_at : null;
}
