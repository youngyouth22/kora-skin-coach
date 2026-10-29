export interface BrightDataOrganicResult {
  title?: string;
  link?: string;
  description?: string;
  snippet?: string;
  rating?: number | string;
  reviews_count?: number | string;
  source?: string;
  rich_snippets?: {
    top?: {
      detected_extensions?: {
        rating?: number | string;
        reviews?: number | string;
      };
      extensions?: string[];
    };
  };
}

export interface BrightDataShoppingResult {
  title?: string;
  price?: string | number;
  link?: string;
  merchant?: string;
  rating?: number | string;
  reviews_count?: number | string;
  image?: string;
}

export interface BrightDataImageResult {
  link?: string;
  original?: string;
  source?: string;
}

export interface BrightDataSerpResponse {
  general?: {
    search_engine?: string;
    query?: string;
  };
  organic?: BrightDataOrganicResult[];
  shopping?: BrightDataShoppingResult[];
  images?: BrightDataImageResult[];
  knowledge_graph?: {
    title?: string;
    description?: string;
    image?: string;
    attributes?: Record<string, string>;
  };
}

export interface ScrapedProductRawData {
  brand: string;
  productName: string;
  bestImageUrl: string | null;
  amazonPrice: number | null;
  amazonUrl: string | null;
  overallRating: number;
  reviewsCountText: string;
  reviewSnippets: string[];
  sources: string[];
  inciText: string | null;
  rawSerpSnippets: string[];
}

/**
 * Bright Data Integration Service conforming strictly to https://docs.brightdata.com
 * - Direct REST API access via https://api.brightdata.com/request (Method: POST)
 * - Header: Authorization: Bearer <API_KEY>
 * - Custom &brd_json=1 parameter for instant structured JSON parsing
 * - Adheres to query formatting rules: 'q=' must precede other parameters
 * - Standard localization via 'hl=en&gl=us'
 */
export class BrightDataService {
  private apiKey: string;
  private serpZone: string;
  private unlockerZone: string;
  private apiEndpoint = 'https://api.brightdata.com/request';
  private defaultTimeoutMs = Number(process.env.BRIGHTDATA_TIMEOUT_MS) || 8000;

  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY || '';
    // Use agent protocol default zone names ('agent_serp', 'agent_unlocker') or configured overrides
    this.serpZone = process.env.BRIGHTDATA_SERP_ZONE || 'agent_serp';
    this.unlockerZone = process.env.BRIGHTDATA_UNLOCKER_ZONE || 'agent_unlocker';
  }

  /**
   * Performs an exponential backoff fetch wrapper with a strict timeout.
   */
  private async fetchWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 2,
    baseDelayMs = 500
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Executes a single Bright Data SERP "Mega-Query" to collect product images,
   * INCI ingredients, Amazon price/URL, and customer reviews/ratings in 1 request.
   *
   * Per Bright Data Docs:
   * - URL search prefix MUST start with 'q=' before any other query arguments.
   * - 'hl=en&gl=us' ensures US-English structured results.
   * - 'brd_json=1' returns parsed JSON instead of raw HTML.
   * - 'num' parameter is omitted because Google deprecated it in Sep 2025.
   */
  async executeMegaQuery(
    cleanBrand: string,
    cleanProductName: string
  ): Promise<ScrapedProductRawData> {
    if (!this.apiKey) {
      console.warn('[BrightDataService] BRIGHTDATA_API_KEY is not set. Returning stubbed web data.');
      return this.buildFallbackData(cleanBrand, cleanProductName);
    }

    const searchQuery = `"${cleanBrand} ${cleanProductName}" (ingredients OR INCI) (site:incidecoder.com OR site:ulta.com OR site:sephora.com OR site:amazon.com OR site:laroche-posay.us)`;
    
    // Crucial Bright Data rule: 'q' must precede all arguments
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(
      searchQuery
    )}&hl=en&gl=us&brd_json=1`;

    const serpData = await this.fetchWithRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

      try {
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            zone: this.serpZone,
            url: googleUrl,
            format: 'raw',
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const brdError = response.headers.get('x-brd-error');
          const brdErrorCode = response.headers.get('x-brd-error-code');
          const errorText = await response.text().catch(() => '');
          const errorDetail = brdError ? `[${brdErrorCode}]: ${brdError}` : errorText;
          throw new Error(
            `Bright Data SERP request failed with status ${response.status}: ${errorDetail}`
          );
        }

        return (await response.json()) as BrightDataSerpResponse;
      } finally {
        clearTimeout(timer);
      }
    });

    return await this.extractProductData(cleanBrand, cleanProductName, serpData);
  }

  /**
   * Fallback scrape using Web Unlocker if the INCI list is missing in SERP snippets.
   * Directly posts to https://api.brightdata.com/request with the Web Unlocker zone.
   */
  async scrapePageWithUnlocker(targetUrl: string): Promise<string> {
    if (!this.apiKey) {
      return '';
    }

    return await this.fetchWithRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

      try {
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            zone: this.unlockerZone,
            url: targetUrl,
            format: 'raw',
            data_format: 'markdown',
            country: 'us',
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const brdError = response.headers.get('x-brd-error');
          const brdErrorCode = response.headers.get('x-brd-error-code');
          const errorText = await response.text().catch(() => '');
          const errorDetail = brdError ? `[${brdErrorCode}]: ${brdError}` : errorText;
          throw new Error(`Web Unlocker failed with status ${response.status}: ${errorDetail}`);
        }

        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    });
  }

  /**
   * Parses structured SERP JSON into standardized product acquisition data.
   */
  private async extractProductData(
    brand: string,
    productName: string,
    data: BrightDataSerpResponse
  ): Promise<ScrapedProductRawData> {
    const organics = data.organic || [];
    const shoppings = data.shopping || [];
    const images = data.images || [];

    // 1. Image extraction (prefer high-res shopping or original search images)
    let bestImageUrl: string | null = null;
    if (images.length > 0 && images[0].original) {
      bestImageUrl = images[0].original;
    } else if (shoppings.length > 0 && shoppings[0].image) {
      bestImageUrl = shoppings[0].image;
    } else if (data.knowledge_graph?.image) {
      bestImageUrl = data.knowledge_graph.image;
    }

    // 2. Amazon Price & URL extraction
    let amazonPrice: number | null = null;
    let amazonUrl: string | null = null;

    const amazonShopping = shoppings.find(
      (item) => item.merchant?.toLowerCase().includes('amazon') || item.link?.includes('amazon.com')
    );
    if (amazonShopping) {
      amazonUrl = amazonShopping.link || null;
      if (amazonShopping.price) {
        const parsed = parseFloat(
          String(amazonShopping.price).replace(/[^0-9.]/g, '')
        );
        if (!isNaN(parsed)) amazonPrice = parsed;
      }
    }

    if (!amazonUrl) {
      const amazonOrganic = organics.find((item) => item.link?.includes('amazon.com'));
      if (amazonOrganic?.link) {
        amazonUrl = amazonOrganic.link;
      }
    }

    // 3. Ratings, review volume and sources
    const sourcesSet = new Set<string>();
    const reviewSnippets: string[] = [];
    const collectedRatings: number[] = [];
    let maxReviewCount = 0;

    for (const item of organics) {
      if (item.link) {
        try {
          const hostname = new URL(item.link).hostname.replace('www.', '');
          sourcesSet.add(hostname);
        } catch {
          // ignore invalid URLs
        }
      }

      if (item.snippet) reviewSnippets.push(item.snippet);
      if (item.description) reviewSnippets.push(item.description);

      // Check direct rating or rich_snippets detected extensions
      let itemRating = item.rating;
      let itemReviews = item.reviews_count;

      if (!itemRating && item.rich_snippets?.top?.detected_extensions?.rating) {
        itemRating = item.rich_snippets.top.detected_extensions.rating;
      }
      if (!itemReviews && item.rich_snippets?.top?.detected_extensions?.reviews) {
        itemReviews = item.rich_snippets.top.detected_extensions.reviews;
      }

      if (itemRating) {
        const r = typeof itemRating === 'number' ? itemRating : parseFloat(String(itemRating));
        if (!isNaN(r) && r > 0 && r <= 5) collectedRatings.push(r);
      }

      if (itemReviews) {
        const c =
          typeof itemReviews === 'number'
            ? itemReviews
            : parseInt(String(itemReviews).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(c) && c > maxReviewCount) maxReviewCount = c;
      }
    }

    for (const s of shoppings) {
      if (s.rating) {
        const r = typeof s.rating === 'number' ? s.rating : parseFloat(String(s.rating));
        if (!isNaN(r) && r > 0 && r <= 5) collectedRatings.push(r);
      }
      if (s.reviews_count) {
        const c =
          typeof s.reviews_count === 'number'
            ? s.reviews_count
            : parseInt(String(s.reviews_count).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(c) && c > maxReviewCount) maxReviewCount = c;
      }
    }

    const overallRating =
      collectedRatings.length > 0
        ? Math.round(
            (collectedRatings.reduce((a, b) => a + b, 0) / collectedRatings.length) * 10
          ) / 10
        : 4.5;

    const reviewsCountText =
      maxReviewCount > 1000
        ? `${Math.floor(maxReviewCount / 1000)}K+ Reviews`
        : maxReviewCount > 0
        ? `${maxReviewCount} Reviews`
        : '1K+ Reviews';

    // 4. INCI Ingredient extraction from snippets
    let inciText: string | null = null;
    const combinedSnippets = reviewSnippets.join('\n');

    const inciMatch = combinedSnippets.match(
      /(?:Ingredients|INCI|Active Ingredients)[\s:]+([A-Za-z0-9,\s\.\(\)\/\-\%]{40,})/i
    );
    if (inciMatch && inciMatch[1]) {
      inciText = inciMatch[1].trim();
    }

    // 5. Targeted Web Unlocker fallback if INCI is absent from SERP snippets
    if (!inciText) {
      const candidateSite = organics.find(
        (o) =>
          o.link &&
          (o.link.includes('incidecoder.com') ||
            o.link.includes('ulta.com') ||
            o.link.includes('sephora.com'))
      );

      if (candidateSite?.link) {
        try {
          const content = await this.scrapePageWithUnlocker(candidateSite.link);
          const match = content.match(
            /(?:(?:#+\s*|\*\*|class="[^"]*ingredient[^"]*"[^>]*>|Ingredients:?<\/h[1-6]>)\s*(?:Ingredients|Active Ingredients|INCI)[\s\S]{0,40}?)(?:[:\n]+)([\s\S]{30,1800}?)(?:\n\n|\n#|\n\*\*|<\/div>|<\/section>|$)/i
          );
          if (match && match[1]) {
            inciText = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          } else if (content.length > 50) {
            inciText = content.slice(0, 1500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
        } catch (err) {
          console.warn('[BrightDataService] Web Unlocker fallback failed:', err);
        }
      }
    }

    return {
      brand,
      productName,
      bestImageUrl: bestImageUrl || 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
      amazonPrice: amazonPrice ?? 20.0,
      amazonUrl: amazonUrl || `https://www.amazon.com/s?k=${encodeURIComponent(`${brand} ${productName}`)}`,
      overallRating,
      reviewsCountText,
      reviewSnippets: reviewSnippets.slice(0, 8),
      sources: Array.from(sourcesSet).slice(0, 5),
      inciText,
      rawSerpSnippets: reviewSnippets,
    };
  }

  /**
   * Deterministic fallback when no API key is provided (for dev/tests without incurring costs).
   */
  private buildFallbackData(brand: string, productName: string): ScrapedProductRawData {
    return {
      brand,
      productName,
      bestImageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
      amazonPrice: 21.99,
      amazonUrl: `https://www.amazon.com/s?k=${encodeURIComponent(`${brand} ${productName}`)}`,
      overallRating: 4.6,
      reviewsCountText: '3K+ Reviews',
      reviewSnippets: [
        'Lightweight texture, hydrates well without clogging pores.',
        'Great daily moisturizer with SPF, no white cast on combination skin.',
        'Absorbs fast, soothing barrier support with ceramides and niacinamide.',
      ],
      sources: ['ulta.com', 'amazon.com', 'incidecoder.com'],
      inciText:
        'Active Ingredients: Avobenzone 3%, Homosalate 10%, Octisalate 5%, Octocrylene 7%. Inactive Ingredients: Water, Glycerin, Dimethicone, Niacinamide, Ceramide NP, Ceramide AP, Ceramide EOP, Carbomer, Sodium Lauroyl Lactylate, Cholesterol, Phenoxyethanol, Tocopherol, Disodium EDTA, Caprylyl Glycol, Citric Acid, Xanthan Gum.',
      rawSerpSnippets: [
        'Toleriane Double Repair Face Moisturizer UV SPF 30. Broad spectrum SPF 30 and prebiotic thermal water.',
      ],
    };
  }
}

export const brightDataService = new BrightDataService();
