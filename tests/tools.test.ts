import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestActionTool } from '../src/mastra/tools/suggest-action.ts';
import { concernHistoryTool } from '../src/mastra/tools/concern-history.ts';
import { experimentDetailsTool } from '../src/mastra/tools/experiment-details.ts';

test('suggestActionTool executes and returns structured action suggestion', async () => {
  const input = {
    type: 'start_experiment' as const,
    label: 'Test Niacinamide Serum',
    payload: { productName: '10% Niacinamide Booster', targets: ['age_spot'] },
  };

  const result: any = await suggestActionTool.execute!(input, {} as any);
  assert.ok(result);
  assert.strictEqual(result.type, 'start_experiment');
  assert.strictEqual(result.label, 'Test Niacinamide Serum');
  assert.deepStrictEqual(result.payload, input.payload);
});

test('suggestActionTool validates schema limits via standard schema', async () => {
  const schema: any = suggestActionTool.inputSchema;

  // Valid input
  const validRes = await schema['~standard'].validate({
    type: 'open_scan',
    label: 'Take Weekly Scan',
  });
  assert.ok(!validRes.issues);
  assert.strictEqual(validRes.value.type, 'open_scan');

  // Invalid action type
  const invalidTypeRes = await schema['~standard'].validate({
    type: 'buy_now_affiliate',
    label: 'Buy Product',
  });
  assert.ok(invalidTypeRes.issues && invalidTypeRes.issues.length > 0);

  // Too long label (max 40)
  const tooLongRes = await schema['~standard'].validate({
    type: 'open_routine',
    label: 'This is a very long label that exceeds the forty character boundary limit',
  });
  assert.ok(tooLongRes.issues && tooLongRes.issues.length > 0);
});

test('concernHistoryTool validates concern enum and weeks boundary', async () => {
  const schema: any = concernHistoryTool.inputSchema;

  const invalidConcernRes = await schema['~standard'].validate({
    concern: 'hydration', // Hydration is labeled 'moisture' in YouCam
    weeks: 8,
  });
  assert.ok(invalidConcernRes.issues && invalidConcernRes.issues.length > 0);

  const validMoistureRes = await schema['~standard'].validate({
    concern: 'moisture',
    weeks: 8,
  });
  assert.ok(!validMoistureRes.issues);

  const invalidWeeksRes = await schema['~standard'].validate({
    concern: 'moisture',
    weeks: 52, // max is 26
  });
  assert.ok(invalidWeeksRes.issues && invalidWeeksRes.issues.length > 0);
});

test('concernHistoryTool handles missing session gracefully without crashing', async () => {
  const result: any = await concernHistoryTool.execute!(
    { concern: 'acne', weeks: 4 },
    { requestContext: new Map() } as any
  );
  assert.ok(result);
  assert.strictEqual(result.concern, 'acne');
  assert.strictEqual(result.points.length, 0);
  assert.ok(result.note.includes('Unable to retrieve history'));
});

test('experimentDetailsTool handles missing session gracefully without crashing', async () => {
  const result: any = await experimentDetailsTool.execute!(
    { limit: 3 },
    { requestContext: new Map() } as any
  );
  assert.ok(result);
  assert.strictEqual(result.experiments.length, 0);
});
