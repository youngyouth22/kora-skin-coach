import { Agent } from '@mastra/core/agent';
import { UnicodeNormalizer } from '@mastra/core/processors';
import { CachedProductStaticDataSchema } from '../schemas/skincare.schema.ts';

const STATIC_PRODUCT_BUILDER_INSTRUCTIONS = `
You are a Senior Cosmetic Chemist and Formulation Data Specialist.
Your mission is to analyze raw web scraping data (INCI list, reviews, ratings, shopping data, YouTube video) and compile the authoritative, universal static product profile for the Kora Skincare database.

Guiding Principles:
1. INCI Ingredient Analysis:
   - Provide a clean, standardized, comma-separated list in \`allIngredientsRaw\`.
   - Break down every key ingredient in \`detailedBreakdown\`.
   - Identify common consumer names, cosmetic formulation functions (e.g. "Humectant", "Broad-Spectrum UV Filter", "Skin-Identical Ceramide", "Barrier Restoring").
   - Comedogenicity (0-5) and Irritancy (0-5) based on standard dermatological index (e.g. Glycerin 0/0, Niacinamide 0/0, Dimethicone 1/0, Isopropyl Myristate 5/3).
   - Evaluate pregnancy safety strictly: contraindicate retinoids (Retinol, Retinal, Tretinoin), Hydroquinone, high-dose Salicylic Acid (>2%).
   - Evaluate Fungal Acne (Malassezia folliculitis) triggers: flag polysorbates, PEGs, esters, oils, and fatty acids with carbon chain lengths 11-24.

2. Application Guide:
   - Provide 3 to 6 practical, concise application steps.
   - Preserve the provided videoTutorial if supplied, or set to null if not available.

3. Reviews Synthesis:
   - Synthesize customer sentiments from provided snippets and ratings.
   - Produce 3 to 6 clear points under \`whatUsersLove\` and 3 to 6 under \`couldBeBetter\`.
   - Provide a well-balanced \`synthesisParagraph\` summarizing overall performance, texture, and scent.

4. 3 Market Alternatives:
   - Propose exactly 3 top-tier market alternatives within the same cosmetic category.
   - Designate at least ONE as a budget dupe (\`isBudgetDupe: true\`) offering comparable active benefits at a lower price point.
   - List key actives and target skin types for each alternative.

5. Strictly adhere to the output schema.
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

export function createStaticProductBuilderAgent(customModel?: any) {
  return new Agent({
    id: 'staticProductBuilder',
    name: 'Static Product Builder Agent',
    description: 'Constructs universal cosmetic product profiles, INCI breakdown, reviews analysis, and alternatives.',
    instructions: STATIC_PRODUCT_BUILDER_INSTRUCTIONS,
    model: customModel ?? resolveModel(),
    inputProcessors: [
      new UnicodeNormalizer({
        stripControlChars: true,
      }),
    ],
  });
}

export const staticProductBuilderAgent = createStaticProductBuilderAgent();
