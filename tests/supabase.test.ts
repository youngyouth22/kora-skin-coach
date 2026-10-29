import test from 'node:test';
import assert from 'node:assert/strict';
import { userSupabase } from '../src/mastra/lib/supabase.ts';
import { formatRecalledMessagesContext } from '../src/mastra/lib/supabase-memory.ts';

test('userSupabase throws if userJwt is missing from requestContext', () => {
  assert.throws(
    () => userSupabase(undefined),
    /Missing user session in request context/
  );

  const emptyContext = new Map();
  assert.throws(
    () => userSupabase(emptyContext as any),
    /Missing user session in request context/
  );
});

test('userSupabase throws if SUPABASE_URL or SUPABASE_ANON_KEY is missing', () => {
  const origUrl = process.env.SUPABASE_URL;
  const origAnon = process.env.SUPABASE_ANON_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;

  const context = new Map([['userJwt', 'test-fake-jwt']]);

  try {
    assert.throws(
      () => userSupabase(context as any),
      /SUPABASE_URL \/ SUPABASE_ANON_KEY are not configured/
    );
  } finally {
    if (origUrl) process.env.SUPABASE_URL = origUrl;
    if (origAnon) process.env.SUPABASE_ANON_KEY = origAnon;
  }
});

test('userSupabase returns a configured Supabase client when config and JWT are present', () => {
  const origUrl = process.env.SUPABASE_URL;
  const origAnon = process.env.SUPABASE_ANON_KEY;

  process.env.SUPABASE_URL = 'https://xyzcompany.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key-12345';

  const context = new Map([['userJwt', 'user-jwt-token-abcdef']]);

  try {
    const client = userSupabase(context as any);
    assert.ok(client);
    assert.strictEqual(typeof client.from, 'function');
  } finally {
    if (origUrl) process.env.SUPABASE_URL = origUrl;
    else delete process.env.SUPABASE_URL;
    if (origAnon) process.env.SUPABASE_ANON_KEY = origAnon;
    else delete process.env.SUPABASE_ANON_KEY;
  }
});

test('formatRecalledMessagesContext formats matches into structured prompt text', () => {
  const empty = formatRecalledMessagesContext([]);
  assert.strictEqual(empty, '');

  const matches = [
    {
      role: 'user' as const,
      content: 'I had redness with Vitamin C 15%',
      created_at: '2026-01-14T10:00:00Z',
      similarity: 0.89,
    },
    {
      role: 'assistant' as const,
      content: 'Let us pause the Vitamin C and focus on barrier repair.',
      created_at: '2026-01-14T10:01:00Z',
      similarity: 0.82,
    },
  ];

  const formatted = formatRecalledMessagesContext(matches);
  assert.ok(formatted.includes('RECALLED PAST MEMORY'));
  assert.ok(formatted.includes('User: I had redness with Vitamin C 15%'));
  assert.ok(formatted.includes('Coach: Let us pause the Vitamin C'));
  assert.ok(formatted.includes('[2026-01-14]'));
});
