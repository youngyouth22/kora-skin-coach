import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Does NOT mutate user data directly. It returns a structured suggestion that the Supabase "coach"
 * Edge Function forwards to the Flutter app as an `action` event, rendered as a button the user can tap.
 */
export const suggestActionTool = createTool({
  id: 'suggest_action',
  description:
    'Propose ONE in-app next step as a tappable button (e.g. start a product test, open the scan screen, open routine). ' +
    'Only use when it clearly helps the user. Never propose more than one per answer.',
  strict: true,
  mcp: {
    annotations: {
      title: 'Suggest In-App Action Button',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  inputSchema: z.object({
    type: z
      .enum(['start_experiment', 'add_routine_item', 'open_scan', 'open_routine', 'open_learn'])
      .describe('The action type corresponding to a Flutter in-app destination or modal.'),
    label: z
      .string()
      .min(2)
      .max(40)
      .describe('Concise button text, e.g. "Test this serum" or "Scan your skin".'),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Optional contextual payload, e.g. { productName: "Niacinamide 10%", targets: ["age_spot"] }'),
  }),
  outputSchema: z.object({
    type: z.string(),
    label: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  execute: async (input) => {
    return {
      type: input.type,
      label: input.label,
      payload: input.payload ?? {},
    };
  },
});
