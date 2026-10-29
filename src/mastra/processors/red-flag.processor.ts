import { BaseProcessor } from '@mastra/core/processors';
import type { ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { detectRedFlags } from '../domain/safety.ts';

/**
 * Enterprise guardrail processor that checks incoming user messages for acute medical red flags
 * before any model call is executed (Article 3, Non-negotiable #2 & #4).
 */
export class RedFlagGuardProcessor extends BaseProcessor<'red-flag-guard'> {
  readonly id = 'red-flag-guard';
  readonly name = 'Red Flag Medical Safety Guardrail';

  processInput(args: ProcessInputArgs): ProcessInputResult {
    const messages = args.messages ?? [];
    if (messages.length === 0) {
      return { messages, systemMessages: args.systemMessages ?? [] };
    }

    // Find the latest user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    let userText = '';

    if (lastUserMsg) {
      if (typeof lastUserMsg.content === 'string') {
        userText = lastUserMsg.content;
      } else if (Array.isArray(lastUserMsg.content)) {
        userText = lastUserMsg.content
          .filter((p: any) => p && typeof p === 'object' && p.type === 'text')
          .map((p: any) => p.text ?? '')
          .join(' ');
      }
    }

    const check = detectRedFlags(userText);
    const systemMessages = [...(args.systemMessages ?? [])];

    if (check.hasRedFlag) {
      args.state.redFlagDetected = true;
      args.state.matchedFlags = check.matchedFlags;
      args.state.referralMessage = check.referralMessage;

      // Short-circuit / tripwire before any model call (Article 3, Non-negotiable #2)
      if (typeof args.abort === 'function') {
        args.abort(check.referralMessage);
      }

      // Secondary guardrail injection if abort is caught or in non-throwing environment
      systemMessages.unshift({
        role: 'system',
        content: `URGENT MEDICAL SAFETY OVERRIDE: The user mentioned red flag symptoms (${check.matchedFlags.join(', ')}). Do NOT give cosmetic advice, do NOT diagnose, and do NOT suggest any routine changes. Output ONLY the following clinical referral text:\n\n${check.referralMessage}`,
      } as any);
    }

    return {
      messages,
      systemMessages,
    };
  }
}
