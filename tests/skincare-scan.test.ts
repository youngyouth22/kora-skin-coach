import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UserProfileSchema,
  CachedProductStaticDataSchema,
  SkincareReportSchema,
  type UserProfile,
  type CachedProductStaticData,
} from '../src/mastra/schemas/skincare.schema.ts';
import { SCIENTIFIC_SOURCES, DEFAULT_SCIENTIFIC_SOURCES } from '../src/mastra/constants/scientific-sources.ts';
import { ProductCacheService } from '../src/mastra/services/cache.service.ts';
import { formatIsoDuration } from '../src/mastra/services/youtube.service.ts';
import { acquireProductWebData } from '../src/mastra/tools/product-acquisition.tool.ts';
import { runProductScan } from '../src/mastra/index.ts';

test('UserProfileSchema validates valid and invalid dermatological profiles', () => {
  const validProfile = {
    userId: 'user_123',
    skinType: 'combination' as const,
    concerns: ['acne', 'redness', 'hyperpigmentation'],
    sensitivities: ['fragrance'],
    isPregnantOrBreastfeeding: false,
    isFungalAcneProne: true,
    currentRoutineIngredients: ['Retinol 0.2%', 'Salicylic Acid 2%'],
    environment: {
      uvIndex: 7,
      humidity: 45,
      city: 'Los Angeles',
    },
  };

  const parsed = UserProfileSchema.parse(validProfile);
  assert.strictEqual(parsed.skinType, 'combination');
  assert.strictEqual(parsed.isFungalAcneProne, true);
  assert.strictEqual(parsed.environment?.uvIndex, 7);

  // Invalid skin type should fail
  assert.throws(() => {
    UserProfileSchema.parse({
      ...validProfile,
      skinType: 'ultra-dry',
    });
  });
});

test('CachedProductStaticDataSchema and SkincareReportSchema enforce production constraints', () => {
  const staticFixture: CachedProductStaticData = {
    normalizedSlug: 'la-roche-posay-toleriane-double-repair-face-moisturizer-uv-spf-30',
    barcode: '3337875545778',
    product: {
      brand: 'La Roche-Posay',
      name: 'Toleriane Double Repair Face Moisturizer UV SPF 30',
      category: 'Sun Protection & Moisturizer',
      imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
    },
    purchaseOptions: {
      available: true,
      retailerName: 'amazon.com',
      price: 23.99,
      currency: 'USD',
      productUrl: 'https://www.amazon.com/dp/B01NCWV3KM',
    },
    applicationGuide: {
      instructions: [
        'Apply liberally 15 minutes before sun exposure.',
        'Smooth gently over entire face and neck until absorbed.',
        'Reapply at least every 2 hours if exposed to direct sun.',
      ],
      videoTutorial: {
        title: 'How to Apply Toleriane Double Repair UV',
        videoUrl: 'https://www.youtube.com/watch?v=mock123',
        thumbnailUrl: 'https://img.youtube.com/vi/mock123/hqdefault.jpg',
        durationText: '2 min',
      },
    },
    reviewsAnalysis: {
      overallRating: 4.6,
      totalReviewsText: '10K+ Reviews',
      synthesisParagraph:
        'A widely celebrated daily sunscreen moisturizer with prebiotic thermal water and ceramides that hydrates without greasiness.',
      sources: ['ulta.com', 'amazon.com', 'laroche-posay.us'],
      whatUsersLove: [
        'No white cast on diverse skin tones',
        'Absorbs quickly without sticky residue',
        'Deeply comforting for compromised moisture barriers',
      ],
      couldBeBetter: [
        'May pill if layered aggressively over silicones',
        'Can sting eyes if applied too close to waterline',
        'Tube packaging makes getting the last drop tricky',
      ],
    },
    formulaStatic: {
      allIngredientsRaw:
        'Avobenzone 3%, Homosalate 10%, Octisalate 5%, Octocrylene 7%, Water, Glycerin, Dimethicone, Niacinamide, Ceramide NP, Cholesterol.',
      pregnancySafeOverall: true,
      fungalAcneSafeOverall: false,
      detailedBreakdown: [
        {
          inciName: 'Niacinamide',
          commonName: 'Vitamin B3',
          function: 'Skin Soothing & Barrier Support',
          safetyRating: 'Safe',
          comedogenicityIndex: 0,
          irritancyIndex: 0,
          isPregnancySafe: true,
          isFungalAcneTrigger: false,
        },
      ],
    },
    baseAlternatives: [
      {
        brand: 'CeraVe',
        name: 'AM Facial Moisturizing Lotion SPF 30',
        imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
        estimatedPrice: 15.99,
        currency: 'USD',
        purchaseUrl: 'https://www.amazon.com/dp/B00F97FHAW',
        isBudgetDupe: true,
        keyActives: ['Ceramides', 'Niacinamide', 'Hyaluronic Acid'],
        targetSkinTypes: ['normal', 'dry'],
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  const parsedStatic = CachedProductStaticDataSchema.parse(staticFixture);
  assert.strictEqual(parsedStatic.normalizedSlug, staticFixture.normalizedSlug);
  assert.strictEqual(parsedStatic.reviewsAnalysis.whatUsersLove.length, 3);

  // Validate final report schema
  const reportFixture = {
    cacheHit: true,
    product: parsedStatic.product,
    matchEvaluation: {
      overallFitPercentage: 89,
      executiveSummary: 'Great match for combination skin desiring daily barrier repair and broad-spectrum UV protection.',
      pillars: {
        skinFit: {
          level: 'High' as const,
          score: 92,
          title: 'Combination Skin Fit',
          explanation: 'Lightweight lotion hydrates dry cheeks while dimethicone controls T-zone shine.',
        },
        effectiveness: {
          level: 'High' as const,
          score: 88,
          title: 'Effectiveness' as const,
          explanation: 'Ceramides NP restore the outer barrier while niacinamide refines pores.',
        },
        safety: {
          level: 'High' as const,
          score: 87,
          title: 'Safety' as const,
          explanation: 'Fragrance-free formula, suitable for sensitive skin.',
          pregnancySafe: true,
          fungalAcneSafe: false,
        },
      },
    },
    purchaseOptions: parsedStatic.purchaseOptions,
    aiAssistant: {
      shortExplanation: 'A reliable dual-action daily moisturizer that defends against UV damage and restores comfort.',
      suggestedQuestions: [
        { emoji: '☀️', question: 'Can I apply makeup over this?' },
        { emoji: '🧴', question: 'How often should I reapply during sun exposure?' },
      ],
      routineConflictWarning: null,
      environmentalTip: 'High UV index detected in Los Angeles. Reapply every 2 hours outdoors.',
    },
    alternatives: [
      {
        brand: 'CeraVe',
        name: 'AM Facial Moisturizing Lotion SPF 30',
        imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
        fitPercentage: 86,
        estimatedPrice: 15.99,
        currency: 'USD',
        purchaseUrl: 'https://www.amazon.com/dp/B00F97FHAW',
        isBudgetDupe: true,
      },
    ],
    applicationGuide: parsedStatic.applicationGuide,
    reviewsAnalysis: parsedStatic.reviewsAnalysis,
    formula: {
      keyIngredients: [
        {
          name: 'Niacinamide',
          role: 'Barrier Restoring',
          benefitForUser: 'Reduces skin redness and balances sebum.',
        },
      ],
      allIngredientsRaw: parsedStatic.formulaStatic.allIngredientsRaw,
      detailedBreakdown: parsedStatic.formulaStatic.detailedBreakdown,
    },
    scientificSources: [...DEFAULT_SCIENTIFIC_SOURCES],
    medicalEndorsement: {
      doctorName: 'Clinical & Cosmetic Formulation Review Board',
      credentials: 'Evidence-Based Dermatology Standards & Cosmetic Science',
    },
  };

  const parsedReport = SkincareReportSchema.parse(reportFixture);
  assert.strictEqual(parsedReport.cacheHit, true);
  assert.strictEqual(parsedReport.scientificSources.length, 7);
  assert.strictEqual(parsedReport.aiAssistant.suggestedQuestions.length, 2);
});

test('formatIsoDuration parses ISO 8601 durations accurately', () => {
  assert.strictEqual(formatIsoDuration('PT2M30S'), '3 min');
  assert.strictEqual(formatIsoDuration('PT2M10S'), '2 min');
  assert.strictEqual(formatIsoDuration('PT45S'), '1 min');
  assert.strictEqual(formatIsoDuration('PT1H10M'), '70 min');
  assert.strictEqual(formatIsoDuration('INVALID'), '2 min');
});

test('SCIENTIFIC_SOURCES contains exactly the 7 authoritative global skincare sources', () => {
  assert.strictEqual(SCIENTIFIC_SOURCES.length, 7);
  const orgs = SCIENTIFIC_SOURCES.map((s) => s.organizationName);
  assert.ok(orgs.some((o) => o.includes('NIH')));
  assert.ok(orgs.some((o) => o.includes('AAD')));
  assert.ok(orgs.some((o) => o.includes('ECHA')));
  assert.ok(orgs.some((o) => o.includes('TGA')));
  assert.ok(orgs.some((o) => o.includes('FDA')));
  assert.ok(orgs.some((o) => o.includes('PubMed')));
  assert.ok(orgs.some((o) => o.includes('EWG')));
});

test('ProductCacheService correctly handles memory cache hit, miss, and key lookups', async () => {
  const cache = new ProductCacheService();
  const testSlug = 'cerave-hydrating-facial-cleanser';
  const testBarcode = '3606000537446';

  // 1. Initial lookup -> miss
  const initial = await cache.get({ normalizedSlug: testSlug, barcode: testBarcode });
  assert.strictEqual(initial, null);

  // 2. Set product data
  const sampleData: CachedProductStaticData = {
    normalizedSlug: testSlug,
    barcode: testBarcode,
    product: {
      brand: 'CeraVe',
      name: 'Hydrating Facial Cleanser',
      category: 'Cleanser',
      imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
    },
    purchaseOptions: {
      available: true,
      retailerName: 'amazon.com',
      price: 14.99,
      currency: 'USD',
      productUrl: 'https://www.amazon.com/dp/B01MSSDEPK',
    },
    applicationGuide: {
      instructions: [
        'Wet face with lukewarm water.',
        'Gently massage cleanser into skin in a circular motion.',
        'Rinse thoroughly and pat dry with a clean towel.',
      ],
      videoTutorial: null,
    },
    reviewsAnalysis: {
      overallRating: 4.7,
      totalReviewsText: '50K+ Reviews',
      synthesisParagraph: 'A staple gentle cleanser that respects the skin barrier without stripping natural oils.',
      sources: ['ulta.com', 'amazon.com'],
      whatUsersLove: [
        'Non-stripping hydrating lotion texture',
        'Fragrance free and non-comedogenic',
        'Leaves skin feeling soft and clean',
      ],
      couldBeBetter: [
        'Does not remove waterproof eye makeup completely',
        'Lacks foaming action for those who prefer lather',
        'Pump mechanism can sometimes clog with dried product',
      ],
    },
    formulaStatic: {
      allIngredientsRaw: 'Water, Glycerin, Cetearyl Alcohol, Ceramide NP, Ceramide AP, Ceramide EOP, Hyaluronic Acid.',
      pregnancySafeOverall: true,
      fungalAcneSafeOverall: false,
      detailedBreakdown: [],
    },
    baseAlternatives: [],
    updatedAt: new Date().toISOString(),
  };

  await cache.set(sampleData);

  // 3. Lookup by slug -> Hit
  const hitBySlug = await cache.get({ normalizedSlug: testSlug });
  assert.ok(hitBySlug);
  assert.strictEqual(hitBySlug?.product.name, 'Hydrating Facial Cleanser');

  // 4. Lookup by barcode -> Hit
  const hitByBarcode = await cache.get({ barcode: testBarcode });
  assert.ok(hitByBarcode);
  assert.strictEqual(hitByBarcode?.product.brand, 'CeraVe');
});

test('acquireProductWebData executes parallel acquisition with resilient fallbacks', async () => {
  const data = await acquireProductWebData('La Roche-Posay', 'Toleriane Double Repair');
  assert.ok(data);
  assert.strictEqual(data.brand, 'La Roche-Posay');
  assert.strictEqual(data.productName, 'Toleriane Double Repair');
  assert.ok(typeof data.overallRating === 'number');
  assert.ok(data.sources.length > 0);
  assert.ok(Array.isArray(data.reviewSnippets));
});

test('End-to-End runProductScan workflow: Cache Miss -> Cache Hit cycle', async () => {
  const profile: UserProfile = {
    userId: 'user_test_999',
    skinType: 'oily',
    concerns: ['acne', 'large_pores'],
    sensitivities: ['fragrance'],
    isPregnantOrBreastfeeding: false,
    isFungalAcneProne: false,
    currentRoutineIngredients: ['Salicylic Acid 2%', 'Niacinamide 10%'],
    environment: {
      uvIndex: 8,
      humidity: 30,
      city: 'Austin',
    },
  };

  const rawOcrInput = `
    LA ROCHE-POSAY LABORATOIRE DERMATOLOGIQUE
    TOLERIANE DOUBLE REPAIR FACE MOISTURIZER UV
    BROAD SPECTRUM SPF 30 SUNSCREEN
    Prebiotic Thermal Water + Ceramide-3 + Niacinamide
    1.7 FL OZ - 50 ml
    UPC: 3337875545778
  `;

  // First run: Cache Miss (acquires data & structures it)
  const report1 = await runProductScan(rawOcrInput, profile);
  assert.ok(report1);
  assert.strictEqual(report1.cacheHit, false, 'First scan must be a cache miss');
  assert.ok(report1.matchEvaluation.overallFitPercentage > 0);
  assert.ok(report1.matchEvaluation.pillars.skinFit);
  assert.ok(report1.matchEvaluation.pillars.effectiveness);
  assert.ok(report1.matchEvaluation.pillars.safety);
  assert.strictEqual(report1.scientificSources.length, 7);
  assert.strictEqual(report1.aiAssistant.suggestedQuestions.length, 2);

  // Environmental tip should be populated for high UV index (8)
  assert.ok(
    report1.aiAssistant.environmentalTip?.includes('Austin') ||
    report1.aiAssistant.environmentalTip?.includes('UV index'),
    'Environmental tip should mention UV defense'
  );

  // Second run: Cache Hit (bypasses Bright Data acquisition)
  const report2 = await runProductScan(rawOcrInput, profile);
  assert.ok(report2);
  assert.strictEqual(report2.cacheHit, true, 'Subsequent scan must hit the 60-day cache');
  assert.strictEqual(report2.product.name, report1.product.name);
});
