import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RequestContext } from '@mastra/core/request-context';

/**
 * Supabase client that acts AS the signed-in user (the Edge Function forwards their JWT in requestContext).
 * Row Level Security therefore guarantees tools can only ever read that user's own rows,
 * and this server never holds the service-role key.
 */
export function userSupabase(requestContext?: RequestContext): SupabaseClient {
  const jwt = requestContext?.get('userJwt');
  if (typeof jwt !== 'string' || !jwt) throw new Error('Missing user session in request context.');
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not configured.');
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
