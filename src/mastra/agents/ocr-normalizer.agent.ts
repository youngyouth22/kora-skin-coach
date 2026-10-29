import { Agent } from '@mastra/core/agent';
import { UnicodeNormalizer } from '@mastra/core/processors';
import { CleanProductQuerySchema } from '../schemas/skincare.schema.ts';

const OCR_NORMALIZER_INSTRUCTIONS = `
You are an expert cosmetic product identifier and OCR normalizer for mobile skincare scans.
Your task is to take noisy raw input (either a barcode or messy OCR text from product bottles/boxes via Google ML Kit) and extract clean, standardized cosmetic product identifiers.

Rules:
1. Identify the brand name clearly (e.g. "La Roche-Posay", "CeraVe", "Paula's Choice", "The Ordinary", "Cosrx", "Beauty of Joseon").
2. Separate the brand name from the product name.
3. Clean all OCR artifacts, dates, batch codes, net weights ("1.7 FL OZ", "50ml"), and packaging gibberish.
4. Detect numeric barcodes (EAN-13, UPC-A, 8-14 digits) if present in the raw input.
5. Create a clean, deterministic normalizedSlug: lowercase, alphanumeric and hyphens only (e.g. "brand-product-name-version").
6. Build a focused searchQuery suitable for finding cosmetic INCI ingredients and reviews.
7. Return strictly valid JSON adhering to the specified schema.
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

export function createOcrNormalizerAgent(customModel?: any) {
  return new Agent({
    id: 'ocrNormalizer',
    name: 'OCR Normalizer Agent',
    description: 'Cleans noisy ML Kit OCR or barcode input into standardized cosmetic product identifiers.',
    instructions: OCR_NORMALIZER_INSTRUCTIONS,
    model: customModel ?? resolveModel(),
    inputProcessors: [
      new UnicodeNormalizer({
        stripControlChars: true,
      }),
    ],
  });
}

export const ocrNormalizerAgent = createOcrNormalizerAgent();
