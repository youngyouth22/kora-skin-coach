import { z } from 'zod';

// 1. Profil Utilisateur en entrée
export const UserProfileSchema = z.object({
  userId: z.string().optional(),
  skinType: z.enum(['oily', 'dry', 'combination', 'normal', 'sensitive']),
  concerns: z.array(z.string()),
  sensitivities: z.array(z.string()).default([]),
  isPregnantOrBreastfeeding: z.boolean().default(false),
  isFungalAcneProne: z.boolean().default(false),
  currentRoutineIngredients: z.array(z.string()).default([]),
  environment: z
    .object({
      uvIndex: z.number().optional(),
      humidity: z.number().optional(),
      city: z.string().optional(),
    })
    .optional(),
});

// 2. Données Statiques Produit (mises en cache en DB pour économiser 100% du scraping aux scans suivants)
export const CachedProductStaticDataSchema = z.object({
  normalizedSlug: z.string(),
  barcode: z.string().optional(),
  product: z.object({
    brand: z.string(),
    name: z.string(),
    category: z.string().describe('Ex: Sun Protection, Moisturizer, Cleanser, Serum'),
    imageUrl: z.string().url(),
  }),
  purchaseOptions: z.object({
    available: z.boolean(),
    retailerName: z.string().default('amazon.com'),
    price: z.number().nullable().describe('Ex: 20.00'),
    currency: z.string().default('USD'),
    productUrl: z.string().url().nullable(),
  }),
  applicationGuide: z.object({
    instructions: z.array(z.string()).min(3).max(6),
    videoTutorial: z
      .object({
        title: z.string(),
        videoUrl: z.string().url(),
        thumbnailUrl: z.string().url(),
        durationText: z.string().describe('Ex: 2 min'),
      })
      .nullable(),
  }),
  reviewsAnalysis: z.object({
    overallRating: z.number().min(0).max(5),
    totalReviewsText: z.string().describe('Ex: 1K+ Reviews'),
    synthesisParagraph: z.string(),
    sources: z.array(z.string()).describe("Ex: ['ulta.com', 'laroche-posay.us', 'trustpilot.com']"),
    whatUsersLove: z.array(z.string()).min(3).max(6),
    couldBeBetter: z.array(z.string()).min(3).max(6),
  }),
  formulaStatic: z.object({
    allIngredientsRaw: z.string(),
    pregnancySafeOverall: z.boolean(),
    fungalAcneSafeOverall: z.boolean(),
    detailedBreakdown: z.array(
      z.object({
        inciName: z.string(),
        commonName: z.string(),
        function: z.string().describe('Ex: Humectant, Broad-Spectrum UV Filter, Emollient'),
        safetyRating: z.enum(['Safe', 'Low Risk', 'Moderate Risk', 'High Risk']),
        comedogenicityIndex: z.number().min(0).max(5),
        irritancyIndex: z.number().min(0).max(5),
        isPregnancySafe: z.boolean(),
        isFungalAcneTrigger: z.boolean(),
      })
    ),
  }),
  baseAlternatives: z
    .array(
      z.object({
        brand: z.string(),
        name: z.string(),
        imageUrl: z.string().url(),
        estimatedPrice: z.number(),
        currency: z.string().default('USD'),
        purchaseUrl: z.string().url().optional(),
        isBudgetDupe: z.boolean().describe("True si c'est un dupe économique à formule similaire"),
        keyActives: z.array(z.string()),
        targetSkinTypes: z.array(z.string()),
      })
    )
    .max(3),
  updatedAt: z.string().datetime(),
});

// 3. Schéma Final Retourné à l'Application Mobile Flutter
export const SkincareReportSchema = z.object({
  cacheHit: z.boolean(),
  product: CachedProductStaticDataSchema.shape.product.extend({
    barcode: z.string().optional(),
  }),
  matchEvaluation: z.object({
    overallFitPercentage: z.number().min(0).max(100).describe('Ex: 87'),
    executiveSummary: z.string().describe("Paragraphe sous 'What Does This Mean?'"),
    pillars: z.object({
      skinFit: z.object({
        level: z.enum(['Low', 'Medium', 'High']),
        score: z.number().min(0).max(100),
        title: z.string().describe('Ex: Combination Skin Fit'),
        explanation: z.string(),
      }),
      effectiveness: z.object({
        level: z.enum(['Low', 'Medium', 'High']),
        score: z.number().min(0).max(100),
        title: z.literal('Effectiveness'),
        explanation: z.string(),
      }),
      safety: z.object({
        level: z.enum(['Low', 'Medium', 'High']),
        score: z.number().min(0).max(100),
        title: z.literal('Safety'),
        explanation: z.string(),
        pregnancySafe: z.boolean(),
        fungalAcneSafe: z.boolean(),
      }),
    }),
  }),
  purchaseOptions: CachedProductStaticDataSchema.shape.purchaseOptions,
  aiAssistant: z.object({
    shortExplanation: z.string().describe("Résumé de 3-4 lignes dans la carte Assistant Explains"),
    suggestedQuestions: z
      .array(
        z.object({
          emoji: z.string(),
          question: z.string(),
        })
      )
      .length(2),
    routineConflictWarning: z.string().nullable().describe('Alerte si conflit avec currentRoutineIngredients'),
    environmentalTip: z.string().nullable().describe("Conseil basé sur l'indice UV ou l'humidité locale"),
  }),
  alternatives: z
    .array(
      z.object({
        brand: z.string(),
        name: z.string(),
        imageUrl: z.string().url(),
        fitPercentage: z.number().min(0).max(100).describe("Score adapté à l'utilisateur, ex: 86"),
        estimatedPrice: z.number(),
        currency: z.string().default('USD'),
        purchaseUrl: z.string().url().optional(),
        isBudgetDupe: z.boolean(),
      })
    )
    .max(3),
  applicationGuide: CachedProductStaticDataSchema.shape.applicationGuide,
  reviewsAnalysis: CachedProductStaticDataSchema.shape.reviewsAnalysis,
  formula: z.object({
    keyIngredients: z.array(
      z.object({
        name: z.string(),
        role: z.string(),
        benefitForUser: z.string(),
      })
    ),
    allIngredientsRaw: z.string(),
    detailedBreakdown: CachedProductStaticDataSchema.shape.formulaStatic.shape.detailedBreakdown,
  }),
  scientificSources: z.array(
    z.object({
      organizationName: z.string(),
      url: z.string().url(),
    })
  ),
  medicalEndorsement: z.object({
    doctorName: z.string().default('Clinical & Cosmetic Formulation Review Board'),
    credentials: z.string().default('Evidence-Based Dermatology Standards & Cosmetic Science'),
  }),
});

// Schéma pour le résultat de normalisation OCR
export const CleanProductQuerySchema = z.object({
  cleanBrand: z.string().describe('Extracted brand name, e.g. "La Roche-Posay"'),
  cleanProductName: z.string().describe('Extracted clear product title without OCR noise, e.g. "Toleriane Double Repair Face Moisturizer UV SPF 30"'),
  barcode: z.string().optional().describe('Clean barcode digits if detected, or undefined'),
  normalizedSlug: z.string().describe('URL/Cache friendly lowercase hyphen-separated slug, e.g. "la-roche-posay-toleriane-double-repair-face-moisturizer-uv-spf-30"'),
  searchQuery: z.string().describe('Optimized SERP query string for product ingredients search'),
});

// Types TypeScript déduits
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type CachedProductStaticData = z.infer<typeof CachedProductStaticDataSchema>;
export type SkincareReport = z.infer<typeof SkincareReportSchema>;
export type CleanProductQuery = z.infer<typeof CleanProductQuerySchema>;
