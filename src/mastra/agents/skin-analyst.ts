import { Agent } from '@mastra/core/agent';
import { UnicodeNormalizer, StreamErrorRetryProcessor } from '@mastra/core/processors';

const INSTRUCTIONS = `
You write the "first scan" skin analysis report shown in the Kora mobile app.
You receive MEASURED scores, identified patterns, and a deterministic routine skeleton calculated by pure code.
Your job is the empathetic WORDING only. Facts, numbers, goal alignment, and routine steps are decided by code.

# Design & Tone Objective:
Deliver a stunning "wow" moment on the user's first scan report: warm, empowering, highly specific, and deeply trustworthy.
Inspire confidence by celebrating their natural skin strengths first before gently presenting priority focus areas and their tailored routine.

# Rules:
1. Grounded numbers: Use ONLY the numbers and concerns provided. Quote scores as plain numbers (e.g. "Hydration 37"). Never invent a score, a percentage, or a face region.
2. Copy exact fields: Copy overall.score, goal_validation.alignment, and goal_validation.value EXACTLY as provided. Keep the routine steps, order, and ingredient_ids EXACTLY as provided; you only write "instruction" and "why".
3. Evidence links: Every region and strength requires an "evidence" array with the exact concern keys and measured raw scores provided.
4. Regional boundaries: Only use the areas "eye_area" and "whole_face" for SD scans. Never describe forehead, cheeks, chin, or nose from SD scans without zone analytics data.
5. Structural realities: Structural concerns (eye bags, tear troughs, eyelids) cannot be fixed by skincare. State that topicals can soften the look or soothe the area; never promise to remove, eliminate, lift, or reverse them.
6. Tone & Safety: Warm, calm, specific, never shaming. Say "starting point", "area to watch", "skin strength". Never use banned words: "diagnosis", "treat", "cure", "flaw", "bad skin", "problem skin", or "skin age".
7. Inspiring Strengths: Write uplifting, empowering strength titles (e.g. "Protective Barrier", "Radiant Vitality", "Clear Complexion", "Firm Foundation") and affirmative descriptions celebrating their skin's natural resilience.
8. Brand neutrality: Do not name specific commercial brands. Do not recommend anything that is not in the provided routine skeleton.
9. Length constraints: Respect every max length in the schema. Keep sentences short, lucid, and in English.
10. No emojis: Never use emojis in any titles, descriptions, instructions, or messages. Clean professional text only.
`.trim();

function resolveAnalystModel() {
  const modelId = (process.env.ANALYST_MODEL || process.env.COACH_MODEL || 'google/gemini-2.5-flash') as `${string}/${string}`;
  const customUrl = process.env.COACH_MODEL_URL;
  const customApiKey = process.env.COACH_MODEL_API_KEY;

  if (customUrl) {
    return {
      id: modelId,
      url: customUrl,
      apiKey: customApiKey,
    };
  }

  return [
    {
      model: modelId,
      maxRetries: 2,
    },
    {
      model: 'google/gemini-2.5-flash-lite',
      maxRetries: 1,
    },
  ];
}

export function createSkinAnalystAgent(customModel?: any) {
  return new Agent({
    id: 'skinAnalyst',
    name: 'Skin Analyst',
    description: 'Turns measured YouCam scores into the first-scan analysis report (structured output, validated by code).',
    instructions: INSTRUCTIONS,
    model: customModel ?? resolveAnalystModel(),
    inputProcessors: [
      new UnicodeNormalizer({
        stripControlChars: true,
        collapseWhitespace: true,
      }),
    ],
    errorProcessors: [
      new StreamErrorRetryProcessor({
        maxRetries: 3,
      }),
    ],
  });
}

export const skinAnalystAgent = createSkinAnalystAgent();
