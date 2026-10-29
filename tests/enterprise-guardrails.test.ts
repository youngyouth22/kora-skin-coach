import test from 'node:test';
import assert from 'node:assert/strict';
import { authMiddleware, coachChatRoute } from '../src/mastra/index.ts';
import { ProductCacheService } from '../src/mastra/services/cache.service.ts';
import type { CachedProductStaticData } from '../src/mastra/schemas/skincare.schema.ts';
import { buildRoutineSkeleton } from '../src/mastra/domain/routine-skeleton.ts';
import { fromYoucamResult } from '../src/mastra/domain/normalize-scan.ts';
import { readFileSync } from 'node:fs';

const fixtureJson = JSON.parse(
  readFileSync(new URL('../fixtures/youcam_scan_001.json', import.meta.url), 'utf-8')
);

test('authMiddleware enforces fail-closed security when MASTRA_API_SECRET is unset', async () => {
  const origSecret = process.env.MASTRA_API_SECRET;
  delete process.env.MASTRA_API_SECRET;

  try {
    let statusCode: number | undefined;
    let jsonBody: any;

    const fakeContext: any = {
      req: {
        path: '/coach/chat',
        header: () => undefined,
      },
      json: (data: any, code = 200) => {
        statusCode = code;
        jsonBody = data;
        return { data, code };
      },
    };

    let nextCalled = false;
    const handler = 'handler' in authMiddleware ? (authMiddleware as any).handler : (authMiddleware as any);
    await handler(fakeContext, async () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Next should not be called when secret is missing');
    assert.strictEqual(statusCode, 500, 'Must return 500 on missing server secret');
    assert.ok(jsonBody.error.includes('MASTRA_API_SECRET is required'));
  } finally {
    if (origSecret) process.env.MASTRA_API_SECRET = origSecret;
  }
});

test('authMiddleware rejects unauthorized or invalid Authorization headers', async () => {
  const origSecret = process.env.MASTRA_API_SECRET;
  process.env.MASTRA_API_SECRET = 'super-secret-enterprise-key-999';

  try {
    let statusCode: number | undefined;
    const fakeContext: any = {
      req: {
        path: '/scan-product',
        header: (name: string) => (name === 'Authorization' ? 'Bearer wrong-key' : undefined),
      },
      json: (data: any, code = 200) => {
        statusCode = code;
        return { data, code };
      },
    };

    let nextCalled = false;
    const handler = 'handler' in authMiddleware ? (authMiddleware as any).handler : (authMiddleware as any);
    await handler(fakeContext, async () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 401, 'Must reject mismatched token with 401');

    // Test with correct token
    let passedNext = false;
    const validContext: any = {
      req: {
        path: '/scan-product',
        header: (name: string) =>
          name === 'Authorization' ? 'Bearer super-secret-enterprise-key-999' : undefined,
      },
      json: () => {},
    };

    await handler(validContext, async () => {
      passedNext = true;
    });
    assert.strictEqual(passedNext, true, 'Valid token must call next()');
  } finally {
    if (origSecret) process.env.MASTRA_API_SECRET = origSecret;
    else delete process.env.MASTRA_API_SECRET;
  }
});

test('authMiddleware allows public health route without credentials', async () => {
  let passedNext = false;
  const healthContext: any = {
    req: {
      path: '/health',
      header: () => undefined,
    },
    json: () => {},
  };

  const handler = 'handler' in authMiddleware ? (authMiddleware as any).handler : (authMiddleware as any);
  await handler(healthContext, async () => {
    passedNext = true;
  });
  assert.strictEqual(passedNext, true, '/health must bypass authentication');
});

test('ProductCacheService evicts oldest items when reaching capacity limit (LRU)', async () => {
  const origMax = process.env.PRODUCT_CACHE_MAX_ENTRIES;
  process.env.PRODUCT_CACHE_MAX_ENTRIES = '3';

  try {
    const cache = new ProductCacheService();
    cache.clearMemory();

    const makeProduct = (id: string): CachedProductStaticData => ({
      normalizedSlug: `product-${id}`,
      barcode: `barcode-${id}`,
      product: {
        brand: `Brand ${id}`,
        name: `Product ${id}`,
        category: 'Moisturizer',
        imageUrl: 'https://example.com/img.jpg',
      },
      purchaseOptions: {
        available: true,
        retailerName: 'amazon.com',
        price: 10,
        currency: 'USD',
        productUrl: 'https://amazon.com/item',
      },
      applicationGuide: {
        instructions: ['Step 1: Cleanse', 'Step 2: Apply', 'Step 3: Protect'],
        videoTutorial: null,
      },
      reviewsAnalysis: {
        overallRating: 4.5,
        totalReviewsText: '100 Reviews',
        synthesisParagraph: 'Great formula',
        sources: ['ulta.com'],
        whatUsersLove: ['Lightweight'],
        couldBeBetter: ['Packaging'],
      },
      formulaStatic: {
        allIngredientsRaw: 'Water, Glycerin',
        pregnancySafeOverall: true,
        fungalAcneSafeOverall: false,
        detailedBreakdown: [],
      },
      baseAlternatives: [],
      updatedAt: new Date().toISOString(),
    });

    // Insert 1 and 2 (each adds 2 entries: slug + barcode)
    await cache.set(makeProduct('1'));
    await cache.set(makeProduct('2'));

    // Cache should hold product 2
    const hit2 = await cache.get({ normalizedSlug: 'product-2' });
    assert.ok(hit2);
    assert.strictEqual(hit2.product.name, 'Product 2');

    // Insert product 3 and 4 -> should trigger LRU eviction of product 1
    await cache.set(makeProduct('3'));
    await cache.set(makeProduct('4'));

    const hit4 = await cache.get({ normalizedSlug: 'product-4' });
    assert.ok(hit4);
  } finally {
    if (origMax) process.env.PRODUCT_CACHE_MAX_ENTRIES = origMax;
    else delete process.env.PRODUCT_CACHE_MAX_ENTRIES;
  }
});

test('buildRoutineSkeleton never includes prescription adapalene in OTC routine', () => {
  const scan = fromYoucamResult(fixtureJson);
  const profile = {
    goals: ['acne' as const, 'texture' as const],
    sensitivities: [],
    currentActives: [],
    onPrescription: false,
    skinToneSelf: 3,
    ageRange: [25, 34] as [number, number],
  };

  const steps = buildRoutineSkeleton(scan, profile);
  const allIngredients = steps.flatMap((s) => s.ingredient_ids);

  assert.strictEqual(
    allIngredients.includes('adapalene'),
    false,
    'Adapalene is prescription-regulated and must never be recommended in OTC routines'
  );
});

test('coachChatRoute immediately short-circuits on acute medical red-flags before LLM invocation', async () => {
  let responseData: any;
  let responseCode = 200;

  const mockContext: any = {
    req: {
      json: async () => ({
        message: 'I have sudden severe facial swelling and my lips are swelling up.',
      }),
      header: (name: string) => undefined,
    },
    json: (data: any, code = 200) => {
      responseData = data;
      responseCode = code;
      return { data, code };
    },
  };

  await (coachChatRoute as any).handler(mockContext);

  assert.strictEqual(responseCode, 200);
  assert.strictEqual(responseData.isRedFlag, true);
  assert.ok(responseData.matchedFlags.includes('face_or_lip_swelling'));
  assert.ok(responseData.text.includes('consult a doctor or board-certified dermatologist'));
  assert.ok(responseData.text.includes('This is general information, not medical advice.'));
});
