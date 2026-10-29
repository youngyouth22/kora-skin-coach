import 'dotenv/config';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import { registerApiRoute } from '@mastra/core/server';
import type { Middleware } from '@mastra/core/server';
import {
  MastraStorageExporter,
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { coachAgent } from './agents/coach.ts';
import { skinAnalystAgent } from './agents/skin-analyst.ts';
import { ocrNormalizerAgent } from './agents/ocr-normalizer.agent.ts';
import { staticProductBuilderAgent } from './agents/static-product-builder.agent.ts';
import { userPersonalizerAgent } from './agents/user-personalizer.agent.ts';
import { concernHistoryTool } from './tools/concern-history.ts';
import { experimentDetailsTool } from './tools/experiment-details.ts';
import { suggestActionTool } from './tools/suggest-action.ts';
import { productAcquisitionTool } from './tools/product-acquisition.tool.ts';
import { skincareScanWorkflow } from './workflows/scan-product.workflow.ts';
import { generateSkinReport } from './services/generate-skin-report.ts';
import {
  UserProfileSchema,
  type UserProfile,
  type SkincareReport,
} from './schemas/skincare.schema.ts';
import { RequestContext } from '@mastra/core/request-context';
import { detectRedFlags } from './domain/safety.ts';

/**
 * Health check route (public, no authentication required).
 */
export const healthRoute = registerApiRoute('/health', {
  method: 'GET',
  handler: async (c) => {
    return c.json({
      status: 'ok',
      service: 'kora-skin-coach',
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Skin report generation endpoint called by Supabase Edge Functions.
 */
export const skinReportRoute = registerApiRoute('/skin-report', {
  method: 'POST',
  handler: async (c) => {
    try {
      const body = await c.req.json();
      if (!body?.scan || !body?.profile) {
        return c.json(
          { error: 'Missing required parameters: "scan" (NormalizedScan) and "profile" (UserProfile).' },
          400
        );
      }
      const result = await generateSkinReport(skinAnalystAgent, body.scan, body.profile);
      return c.json(result);
    } catch (err) {
      return c.json(
        { error: `Report generation failed: ${err instanceof Error ? err.message : String(err)}` },
        500
      );
    }
  },
});

/**
 * Skincare Product Scan endpoint: OCR / barcode -> SERP Mega-Query & YouTube -> User Personalized Report.
 */
export const scanProductRoute = registerApiRoute('/scan-product', {
  method: 'POST',
  handler: async (c) => {
    try {
      const body = await c.req.json();
      if (!body?.rawInput || !body?.userProfile) {
        return c.json(
          { error: 'Missing required parameters: "rawInput" (string) and "userProfile" (UserProfile).' },
          400
        );
      }
      const parsedProfile = UserProfileSchema.parse(body.userProfile);
      const report = await runProductScan(body.rawInput, parsedProfile);
      return c.json(report);
    } catch (err) {
      return c.json(
        { error: `Product scan failed: ${err instanceof Error ? err.message : String(err)}` },
        500
      );
    }
  },
});

/**
 * Interactive Coach chat endpoint called by Flutter or Supabase Edge Functions.
 * Accepts: { message: string, threadId?: string, coachContext?: any, userJwt?: string, userId?: string }
 * Passes userJwt and userId into RequestContext for secure RLS database access.
 * Performs deterministic Red Flag triage BEFORE any model call (Article 3, Non-negotiable #2).
 */
export const coachChatRoute = registerApiRoute('/coach/chat', {
  method: 'POST',
  handler: async (c) => {
    try {
      const body = await c.req.json();
      if (!body?.message || typeof body.message !== 'string') {
        return c.json({ error: 'Missing required parameter: "message" (string).' }, 400);
      }

      // 1. Immediate Rule-Based Red Flag Safety Check (Article 3, Non-negotiable #2)
      const redFlagCheck = detectRedFlags(body.message);
      if (redFlagCheck.hasRedFlag) {
        return c.json({
          text: redFlagCheck.referralMessage,
          isRedFlag: true,
          matchedFlags: redFlagCheck.matchedFlags,
          suggestedAction: null,
        });
      }

      // 2. Prepare RequestContext with user JWT and data snapshot
      const requestContext = new RequestContext();
      const userJwt = c.req.header('x-user-jwt') || c.req.header('x-supabase-auth') || body.userJwt;
      const userId = c.req.header('x-user-id') || body.userId;
      if (userJwt) requestContext.set('userJwt', userJwt);
      if (userId) requestContext.set('userId', userId);
      if (body.coachContext) requestContext.set('coachContext', body.coachContext);

      // 3. Generate coach response using Gemini coach agent
      const response = await coachAgent.generate(body.message, {
        memory: body.threadId
          ? {
              thread: body.threadId,
              resource: userId || 'anonymous-user',
            }
          : undefined,
        requestContext,
      });

      return c.json({
        text: response.text,
        isRedFlag: false,
        suggestedAction:
          (response as any).toolResults?.find((t: any) => t.toolName === 'suggest_action')?.result ?? null,
      });
    } catch (err) {
      return c.json(
        { error: `Coach response failed: ${err instanceof Error ? err.message : String(err)}` },
        500
      );
    }
  },
});

/**
 * Authentication middleware enforcing Bearer token security on protected API endpoints.
 * Protects custom Kora endpoints called by Flutter or Edge Functions (/coach/chat, /skin-report, /scan-product).
 * Allows Mastra Studio web interface, static assets, and health checks to operate freely.
 * Fail-Closed: Rejects requests if MASTRA_API_SECRET is missing or token is mismatched.
 */
export const authMiddleware: Middleware = {
  path: '*',
  handler: async (c, next) => {
    const path = c.req.path || '';

    // Only enforce authentication on protected Kora API endpoints
    const isProtected =
      path === '/coach/chat' ||
      path.startsWith('/coach/chat') ||
      path === '/api/coach/chat' ||
      path.startsWith('/api/coach/chat') ||
      path === '/skin-report' ||
      path.startsWith('/skin-report') ||
      path === '/api/skin-report' ||
      path.startsWith('/api/skin-report') ||
      path === '/scan-product' ||
      path.startsWith('/scan-product') ||
      path === '/api/scan-product' ||
      path.startsWith('/api/scan-product');

    if (!isProtected) {
      return next();
    }

    const secret = process.env.MASTRA_API_SECRET;
    // Fail-closed enforcement on protected endpoints
    if (!secret) {
      console.error('[authMiddleware] Security Configuration Error: MASTRA_API_SECRET is required');
      return c.json({ error: 'Server security misconfiguration: MASTRA_API_SECRET is required' }, 500);
    }
    const authHeader = c.req.header('Authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized: invalid or missing Authorization header' }, 401);
    }
    return next();
  },
};

/**
 * Resolves the primary persistence store for Mastra runtime & memory.
 * In production on Supabase, connects to PostgreSQL via SUPABASE_DB_URL or DATABASE_URL.
 * In development or testing, falls back cleanly to LibSQL / SQLite.
 */
export function resolveStorage() {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL;

  if (connectionString) {
    return new PostgresStore({
      id: 'supabase-pg-storage',
      connectionString,
    });
  }

  return new LibSQLStore({
    id: 'mastra-storage',
    url: process.env.TURSO_DATABASE_URL || 'file:./mastra.db',
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
}

/**
 * Executes the complete skincare scan workflow for a given raw barcode/OCR input and user profile.
 * Ready for direct invocation from REST controllers, Edge Functions, or the Flutter client.
 */
export async function runProductScan(
  rawInput: string,
  userProfile: UserProfile
): Promise<SkincareReport> {
  const run = await skincareScanWorkflow.createRun();
  const res = await run.start({
    inputData: { rawInput, userProfile },
  });

  if (res.status === 'success') {
    if (res.result) {
      return res.result as SkincareReport;
    }
    const personalizeStep = res.steps?.['personalize-report-step'];
    if (personalizeStep && 'output' in personalizeStep && personalizeStep.output) {
      return personalizeStep.output as SkincareReport;
    }
  }

  const err = (res as { error?: { message?: string } | string }).error;
  const errMsg = typeof err === 'object' && err?.message ? err.message : String(err || 'Workflow step failed');
  throw new Error(`Product scan workflow ended with status "${res.status}": ${errMsg}`);
}

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: {
    coachAgent,
    skinAnalystAgent,
    ocrNormalizerAgent,
    staticProductBuilderAgent,
    userPersonalizerAgent,
  },
  tools: {
    concernHistoryTool,
    experimentDetailsTool,
    suggestActionTool,
    productAcquisitionTool,
  },
  workflows: {
    skincareScanWorkflow,
  },
  server: {
    apiRoutes: [healthRoute, skinReportRoute, scanProductRoute, coachChatRoute],
    middleware: [authMiddleware],
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: resolveStorage(),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'kora-skin-coach',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});

// Re-export services, schemas, and agents for easy modular consumption
export * from './schemas/skincare.schema.ts';
export * from './constants/scientific-sources.ts';
export * from './services/cache.service.ts';
export * from './services/brightdata.service.ts';
export * from './services/youtube.service.ts';
export * from './tools/product-acquisition.tool.ts';
export * from './agents/ocr-normalizer.agent.ts';
export * from './agents/static-product-builder.agent.ts';
export * from './agents/user-personalizer.agent.ts';
export * from './workflows/scan-product.workflow.ts';
