import type { RequestContext } from '@mastra/core/request-context';
import { userSupabase } from './supabase.ts';

export interface SupabaseChatMessage {
  id?: string;
  user_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context?: Record<string, unknown> | null;
  feedback?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  embedding?: number[] | null;
  created_at?: string;
}

export interface MatchedChatMessage extends SupabaseChatMessage {
  similarity: number;
}

/**
 * Clean Architecture helper: Reads recent chat history directly from Supabase's `messages` table
 * using the user's authenticated JWT (enforcing Row Level Security).
 */
export async function fetchUserChatHistory(
  requestContext?: RequestContext,
  options: { limit?: number } = {}
): Promise<SupabaseChatMessage[]> {
  const db = userSupabase(requestContext);
  const limit = options.limit ?? 20;

  const { data, error } = await db
    .from('messages')
    .select('id, user_id, role, content, context, feedback, tokens_in, tokens_out, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch user chat history from Supabase: ${error.message}`);
  }

  // Return in chronological order (oldest to newest)
  return ((data as SupabaseChatMessage[]) ?? []).reverse();
}

/**
 * Clean Architecture helper: Appends a chat message to Supabase's `messages` table
 * using the user's authenticated JWT (enforcing Row Level Security).
 * Supports persisting vector embeddings for pgvector semantic recall.
 */
export async function saveUserChatMessage(
  requestContext: RequestContext | undefined,
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    context?: Record<string, unknown> | null;
    tokens_in?: number;
    tokens_out?: number;
    embedding?: number[] | null;
  }
): Promise<SupabaseChatMessage> {
  const db = userSupabase(requestContext);
  const userId = requestContext?.get('userId');

  const insertPayload: Record<string, unknown> = {
    role: message.role,
    content: message.content,
    context: message.context ?? null,
  };

  if (userId) {
    insertPayload.user_id = userId;
  }
  if (message.tokens_in !== undefined) {
    insertPayload.tokens_in = message.tokens_in;
  }
  if (message.tokens_out !== undefined) {
    insertPayload.tokens_out = message.tokens_out;
  }
  if (message.embedding !== undefined) {
    insertPayload.embedding = message.embedding;
  }

  const { data, error } = await db
    .from('messages')
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save message to Supabase: ${error.message}`);
  }

  return data as SupabaseChatMessage;
}

/**
 * Vector Search / Semantic Recall:
 * Queries past conversation history using Supabase pgvector RPC `match_messages`.
 * Uses Row Level Security so users can only ever search their own past messages.
 */
export async function searchSimilarPastMessages(
  requestContext: RequestContext | undefined,
  embedding: number[],
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<MatchedChatMessage[]> {
  const db = userSupabase(requestContext);
  const matchThreshold = options.matchThreshold ?? 0.65;
  const matchCount = options.matchCount ?? 4;

  const { data, error } = await db.rpc('match_messages', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    throw new Error(`Failed to search similar past messages via pgvector: ${error.message}`);
  }

  return (data as MatchedChatMessage[]) ?? [];
}

/**
 * Formats recalled past messages into concise, factual context to inject into LLM prompts.
 */
export function formatRecalledMessagesContext(matches: MatchedChatMessage[]): string {
  if (!matches || matches.length === 0) return '';

  const formatted = matches
    .map((m) => {
      const date = m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : 'Past';
      const role = m.role === 'user' ? 'User' : 'Coach';
      return `[${date}] ${role}: ${m.content}`;
    })
    .join('\n');

  return `\n# RECALLED PAST MEMORY (Relevant past exchanges retrieved via vector search):\n${formatted}\n`;
}
