import { Agent } from '@mastra/core/agent';
import { UnicodeNormalizer } from '@mastra/core/processors';
import { SkincareReportSchema } from '../schemas/skincare.schema.ts';
import { DEFAULT_SCIENTIFIC_SOURCES } from '../constants/scientific-sources.ts';

const USER_PERSONALIZER_INSTRUCTIONS = `
You are the Kora Personalized AI Skin Coach.
Your task is to take universal, static cosmetic product data and tailor a personalized, dermatologically sound match report for a specific user profile.

Input context:
- Static Product Data: INCI formula breakdown, reviews, ratings, category, alternatives.
- User Profile: skin type, skin concerns, ingredient sensitivities, pregnancy/nursing status, fungal acne proneness, active ingredients in current routine, and local environment (UV index, humidity).

Evaluation Criteria:
1. Match Evaluation & Pillars:
   - Calculate \`overallFitPercentage\` (0-100) reflecting how well the formula addresses user goals, skin type, and safety requirements.
   - Write a clear, empowering \`executiveSummary\` under "What Does This Mean?".
   - 3 Pillars:
     - \`skinFit\`: Assess compatibility with their skin type (e.g. "Combination Skin Fit", "Dry Skin Fit").
     - \`effectiveness\`: Assess ability of key actives to target user concerns (e.g. acne, redness, aging, hydration).
     - \`safety\`: Rigorously evaluate against user sensitivities, pregnancy/nursing restrictions, and fungal acne proneness.

2. AI Assistant Card:
   - \`shortExplanation\`: 3 to 4 punchy lines summarizing the match and key benefits.
   - \`suggestedQuestions\`: Exactly 2 relevant, conversational questions with emojis (e.g. "☀️ Can I layer this under makeup?", "🌿 Does this contain any fragrance?").
   - \`routineConflictWarning\`: String alert if a conflict exists between this product's actives and user's current routine (e.g. combining Retinoids with AHAs/BHAs, or Benzoyl Peroxide with Retinol). Return null if no conflict.
   - \`environmentalTip\`: Personalized weather tip if UV index or humidity is provided (e.g. high UV index requires reapplying every 2h, low humidity requires occlusive layer). Return null if not applicable.

3. Formula Personalization:
   - Highlight 3-5 \`keyIngredients\` showing the specific \`benefitForUser\` based on their unique skin concerns.

4. Alternatives:
   - Calculate a tailored \`fitPercentage\` for each of the base alternatives relative to this user profile.

5. Tone & Boundaries:
   - Warm, empowering, respectful, non-shaming. Never use terms like "flaws", "bad skin", "curing", or "diagnosis".
   - Never promise that topicals can fix deep structural conditions (eye bags, tear troughs, sagging).
   - Use the provided scientific sources and medical endorsement.
`.trim();

function resolveModel() {
  const modelId = (process.env.COACH_MODEL || 'google/gemini-2.5-flash') as `${string}/${string}`;
  const customUrl = process.env.COACH_MODEL_URL;
  const customApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.COACH_MODEL_API_KEY;

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

export function createUserPersonalizerAgent(customModel?: any) {
  return new Agent({
    id: 'userPersonalizer',
    name: 'User Personalizer Agent',
    description: 'Personalizes cosmetic static data according to the user dermatological profile.',
    instructions: USER_PERSONALIZER_INSTRUCTIONS,
    model: customModel ?? resolveModel(),
    inputProcessors: [
      new UnicodeNormalizer({
        stripControlChars: true,
      }),
    ],
  });
}

export const userPersonalizerAgent = createUserPersonalizerAgent();
