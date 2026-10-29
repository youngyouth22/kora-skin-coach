import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { userSupabase } from '../lib/supabase.ts';

export const experimentDetailsTool = createTool({
  id: 'get_experiment_details',
  description:
    "Get the user's product experiments (tests): status, target concerns, adherence and the verdict if finished. " +
    'Use it when asked whether a product works or how a test is going.',
  strict: true,
  mcp: {
    annotations: {
      title: 'Get Product Experiments',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe('Maximum number of recent experiments to retrieve (1 to 5). Defaults to 3.'),
  }),
  outputSchema: z.object({
    experiments: z.array(
      z.object({
        title: z.string(),
        status: z.string(),
        targets: z.array(z.string()),
        started_on: z.string(),
        planned_days: z.number(),
        adherence: z.number().nullable(),
        verdict: z.unknown().nullable(),
      })
    ),
  }),
  execute: async (input, context) => {
    try {
      const db = userSupabase(context?.requestContext);
      const res = await db
        .from('experiments')
        .select('title, status, targets, started_on, planned_days, adherence, verdict')
        .order('started_at', { ascending: false })
        .limit(input.limit);

      if (res.error) {
        throw new Error(`Failed to load experiments: ${res.error.message}`);
      }

      return {
        experiments: (res.data ?? []).map((e) => ({
          title: String(e.title ?? 'Untitled Product'),
          status: String(e.status ?? 'unknown'),
          targets: Array.isArray(e.targets) ? (e.targets as string[]) : [],
          started_on: String(e.started_on ?? ''),
          planned_days: Number(e.planned_days ?? 28),
          adherence: e.adherence === null || e.adherence === undefined ? null : Number(e.adherence),
          verdict: (e.verdict as Record<string, unknown> | null)?.primary ?? null,
        })),
      };
    } catch (err) {
      return {
        experiments: [],
      };
    }
  },
});
