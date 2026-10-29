import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { userSupabase } from '../lib/supabase.ts';

const ConcernEnum = z.enum([
  'acne',
  'redness',
  'age_spot',
  'texture',
  'pore',
  'wrinkle',
  'moisture',
  'oiliness',
  'radiance',
  'dark_circle_v2',
  'firmness',
  'eye_bag',
]);

export const concernHistoryTool = createTool({
  id: 'get_concern_history',
  description:
    "Get the user's score history for ONE skin concern across their recent scans (oldest to newest). " +
    'Use it when the question is about a trend, a change over time, or whether something improved.',
  strict: true,
  mcp: {
    annotations: {
      title: 'Get Concern Score History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  inputSchema: z.object({
    concern: ConcernEnum.describe('The specific skin concern to look up history for.'),
    weeks: z
      .number()
      .int()
      .min(2)
      .max(26)
      .default(8)
      .describe('Number of weeks of history to retrieve (between 2 and 26). Defaults to 8.'),
  }),
  outputSchema: z.object({
    concern: z.string(),
    points: z.array(
      z.object({
        date: z.string().describe('YYYY-MM-DD scan date'),
        score: z.number().describe('Measured raw score (0-100, higher = better)'),
      })
    ),
    change: z
      .number()
      .nullable()
      .describe('Score difference between latest and oldest scan, or null if insufficient points'),
    note: z.string(),
  }),
  execute: async (input, context) => {
    try {
      const db = userSupabase(context?.requestContext);
      const since = new Date(Date.now() - input.weeks * 7 * 86_400_000).toISOString();

      const scans = await db
        .from('scans')
        .select('id, created_at')
        .eq('status', 'done')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(60);

      if (scans.error) {
        throw new Error(`Failed to load scans: ${scans.error.message}`);
      }

      const scanList = scans.data ?? [];
      const ids = scanList.map((s) => s.id as string);

      if (ids.length === 0) {
        return {
          concern: input.concern,
          points: [],
          change: null,
          note: 'No completed scans found in this time period.',
        };
      }

      const rows = await db
        .from('scan_concerns')
        .select('scan_id, raw_score, zone')
        .eq('concern', input.concern)
        .in('scan_id', ids);

      if (rows.error) {
        throw new Error(`Failed to load scan concerns: ${rows.error.message}`);
      }

      const byScan = new Map<string, number>();
      for (const r of rows.data ?? []) {
        if (!r.zone || r.zone === 'whole') {
          byScan.set(r.scan_id as string, Number(r.raw_score));
        }
      }

      const points = scanList
        .filter((s) => byScan.has(s.id as string))
        .map((s) => ({
          date: String(s.created_at).slice(0, 10),
          score: Math.round(byScan.get(s.id as string)! * 10) / 10,
        }));

      const change =
        points.length >= 2
          ? Math.round((points[points.length - 1].score - points[0].score) * 10) / 10
          : null;

      return {
        concern: input.concern,
        points,
        change,
        note: 'Scores are estimates from photos; changes under about 3 points are within normal scan-to-scan noise.',
      };
    } catch (err) {
      return {
        concern: input.concern,
        points: [],
        change: null,
        note: `Unable to retrieve history: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
