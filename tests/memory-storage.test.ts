import test from 'node:test';
import assert from 'node:assert/strict';
import { coachAgent, SkincareUserProfileSchema } from '../src/mastra/agents/coach.ts';
import { resolveStorage } from '../src/mastra/index.ts';

test('coachAgent has enterprise memory configured with workingMemory and messageHistory', async () => {
  const memory: any = await coachAgent.getMemory();
  assert.ok(memory, 'coachAgent should have a memory instance configured');

  const config = memory.threadConfig;
  assert.ok(config, 'memory should have threadConfig configured');

  // Working memory must be enabled and scoped per user (resource)
  assert.strictEqual(config.workingMemory?.enabled, true);
  assert.strictEqual(config.workingMemory?.scope, 'resource');
  assert.ok(config.workingMemory?.schema, 'workingMemory must have a defined schema');

  // Message history token limits
  assert.strictEqual(config.messageHistory?.maxTokens, 4000);
  assert.strictEqual(config.messageHistory?.atMaxRemoveTokens, 1000);

  // Auto-generation of chat thread titles
  assert.strictEqual(config.generateTitle, true);
});

test('SkincareUserProfileSchema validates structured user profile attributes', () => {
  const validProfile = {
    skinType: 'combination' as const,
    allergiesOrSensitivities: ['fragrance', 'essential oils'],
    pregnancyOrNursing: true,
    targetConcerns: ['hydration', 'redness'],
    routinePreferences: 'minimalist 3 steps, mineral sunscreen only',
  };

  const parsed = SkincareUserProfileSchema.safeParse(validProfile);
  assert.strictEqual(parsed.success, true);

  // Invalid skin type
  const invalidType = SkincareUserProfileSchema.safeParse({
    skinType: 'alien_skin',
  });
  assert.strictEqual(invalidType.success, false);
});

test('resolveStorage returns PostgresStore when SUPABASE_DB_URL is set and LibSQLStore otherwise', () => {
  const origSupabaseDb = process.env.SUPABASE_DB_URL;
  const origDbUrl = process.env.DATABASE_URL;

  try {
    delete process.env.SUPABASE_DB_URL;
    delete process.env.DATABASE_URL;

    // Default fallback
    const fallbackStore = resolveStorage();
    assert.strictEqual(fallbackStore.id, 'mastra-storage');

    // When Supabase PostgreSQL URL is provided
    process.env.SUPABASE_DB_URL = 'postgresql://postgres:secret@db.xyz.supabase.co:5432/postgres';
    const pgStore = resolveStorage();
    assert.strictEqual(pgStore.id, 'supabase-pg-storage');
  } finally {
    if (origSupabaseDb) process.env.SUPABASE_DB_URL = origSupabaseDb;
    else delete process.env.SUPABASE_DB_URL;

    if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
    else delete process.env.DATABASE_URL;
  }
});
