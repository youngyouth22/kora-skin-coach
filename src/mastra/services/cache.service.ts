import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CachedProductStaticDataSchema,
  type CachedProductStaticData,
} from '../schemas/skincare.schema.ts';

const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds
const MAX_CACHE_ENTRIES = Number(process.env.PRODUCT_CACHE_MAX_ENTRIES) || 1000;

interface CacheEntry {
  data: CachedProductStaticData;
  expiresAt: number;
}

export class ProductCacheService {
  private memoryCache = new Map<string, CacheEntry>();
  private supabaseClient: SupabaseClient | null = null;
  private tableName = 'products_cache';

  constructor() {
    this.initSupabase();
  }

  private initSupabase(): void {
    const url = process.env.SUPABASE_URL;
    // Article 3, Non-negotiable #5: Only user JWT or anon key in Mastra, service-role lives strictly in Edge Functions
    const key = process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      try {
        this.supabaseClient = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      } catch (err) {
        console.warn('[ProductCacheService] Failed to initialize Supabase client:', err);
        this.supabaseClient = null;
      }
    }
  }

  /**
   * Retrieves a cached product by barcode or normalizedSlug.
   * Checks in-memory cache first with LRU refresh, then falls back to Supabase.
   */
  async get(keys: {
    barcode?: string;
    normalizedSlug?: string;
  }): Promise<CachedProductStaticData | null> {
    const now = Date.now();

    // 1. Check in-memory cache with LRU refresh
    if (keys.barcode) {
      const cacheKey = `barcode:${keys.barcode}`;
      const entry = this.memoryCache.get(cacheKey);
      if (entry) {
        if (entry.expiresAt > now) {
          // LRU refresh: re-insert to mark as recently used
          this.memoryCache.delete(cacheKey);
          this.memoryCache.set(cacheKey, entry);
          return entry.data;
        } else {
          this.memoryCache.delete(cacheKey);
        }
      }
    }

    if (keys.normalizedSlug) {
      const cacheKey = `slug:${keys.normalizedSlug}`;
      const entry = this.memoryCache.get(cacheKey);
      if (entry) {
        if (entry.expiresAt > now) {
          // LRU refresh
          this.memoryCache.delete(cacheKey);
          this.memoryCache.set(cacheKey, entry);
          return entry.data;
        } else {
          this.memoryCache.delete(cacheKey);
        }
      }
    }

    // 2. Fall back to Supabase if configured
    if (!this.supabaseClient) {
      return null;
    }

    try {
      let query = this.supabaseClient.from(this.tableName).select('*').limit(1);

      if (keys.barcode && keys.normalizedSlug) {
        query = query.or(
          `barcode.eq.${keys.barcode},normalized_slug.eq.${keys.normalizedSlug}`
        );
      } else if (keys.barcode) {
        query = query.eq('barcode', keys.barcode);
      } else if (keys.normalizedSlug) {
        query = query.eq('normalized_slug', keys.normalizedSlug);
      } else {
        return null;
      }

      const { data, error } = await query.maybeSingle();

      if (error || !data) {
        return null;
      }

      // Check TTL based on updated_at
      const updatedAt = new Date(data.updated_at || data.updatedAt).getTime();
      if (Number.isFinite(updatedAt) && now - updatedAt > CACHE_TTL_MS) {
        return null; // Expired
      }

      const rawProduct = data.data ?? data;
      const parsed = CachedProductStaticDataSchema.safeParse(rawProduct);

      if (!parsed.success) {
        console.warn(
          '[ProductCacheService] Invalid cached product format:',
          parsed.error.issues
        );
        return null;
      }

      // Populate in-memory cache for subsequent fast hits
      this.setInMemory(parsed.data);
      return parsed.data;
    } catch (err) {
      console.warn('[ProductCacheService] Supabase cache read error (falling back):', err);
      return null;
    }
  }

  /**
   * Saves a product's static data into the cache (in-memory and Supabase).
   */
  async set(productData: CachedProductStaticData): Promise<void> {
    // 1. Update in-memory cache
    this.setInMemory(productData);

    // 2. Persist to Supabase if configured
    if (!this.supabaseClient) {
      return;
    }

    try {
      const payload = {
        normalized_slug: productData.normalizedSlug,
        barcode: productData.barcode ?? null,
        brand: productData.product.brand,
        name: productData.product.name,
        data: productData,
        updated_at: productData.updatedAt || new Date().toISOString(),
      };

      const { error } = await this.supabaseClient
        .from(this.tableName)
        .upsert(payload, { onConflict: 'normalized_slug' });

      if (error) {
        console.warn('[ProductCacheService] Supabase upsert error:', error.message);
      }
    } catch (err) {
      console.warn('[ProductCacheService] Supabase cache write error:', err);
    }
  }

  private setInMemory(productData: CachedProductStaticData): void {
    const expiresAt = Date.now() + CACHE_TTL_MS;
    const entry: CacheEntry = { data: productData, expiresAt };

    // Evict oldest entries if capacity is reached
    while (this.memoryCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      } else {
        break;
      }
    }

    if (productData.normalizedSlug) {
      const key = `slug:${productData.normalizedSlug}`;
      this.memoryCache.delete(key);
      this.memoryCache.set(key, entry);
    }
    if (productData.barcode) {
      const key = `barcode:${productData.barcode}`;
      this.memoryCache.delete(key);
      this.memoryCache.set(key, entry);
    }
  }

  /**
   * Helper to clear memory cache (useful for tests)
   */
  clearMemory(): void {
    this.memoryCache.clear();
  }
}

export const productCacheService = new ProductCacheService();
