import type { AppData } from './types';
import { supabase } from './supabase';

/** One row per account. RLS on the table restricts every operation to auth.uid(). */
export const DATA_TABLE = 'walnut_data';

export const remoteEnabled = Boolean(supabase);

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

export async function fetchRemote(userId: string): Promise<AppData | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(DATA_TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toMessage(error);
  return (data?.data as AppData | undefined) ?? null;
}

export async function saveRemote(userId: string, doc: AppData): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(DATA_TABLE).upsert({
    user_id: userId,
    version: doc.version,
    data: doc,
    updated_at: new Date().toISOString(),
  });
  if (error) throw toMessage(error);
}
