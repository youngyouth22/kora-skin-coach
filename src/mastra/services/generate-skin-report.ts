import { SkinReportSchema, type SkinReport } from '../domain/skin-report.schema.ts';
import { validateReport } from '../domain/report-validator.ts';
import { buildFallbackReport } from '../domain/fallback-report.ts';
import { goalAlignment } from '../domain/goal-alignment.ts';
import { buildRoutineSkeleton, type UserProfile } from '../domain/routine-skeleton.ts';
import { KB_BY_ID } from '../kb/kb.ts';
import type { NormalizedScan } from '../domain/normalize-scan.ts';
import { skinAnalystAgent } from '../agents/skin-analyst.ts';

export interface ReportResult {
  report: SkinReport;
  source: 'llm' | 'fallback';
  attempts: number;
  errors: string[];
}

/** Minimal surface we need from a Mastra Agent (lets tests inject a fake). */
export interface ObjectGenerator {
  generate: (prompt: string, options: any) => Promise<{ object?: unknown }>;
}

export function buildReportPrompt(scan: NormalizedScan, profile: UserProfile, repairErrors: string[] = []): string {
  const skeleton = buildRoutineSkeleton(scan, profile).map((s) => ({
    step: s.step,
    name: s.name,
    time_of_day: s.time_of_day,
    ingredient_ids: s.ingredient_ids,
    ingredient_names: s.ingredient_ids.map((i) => KB_BY_ID.get(i)?.name),
    frequency: s.frequency,
    caution: s.caution,
  }));
  const ga = goalAlignment(profile.goals[0] ?? '', scan);
  const data = {
    overall: scan.overall,
    overallBand: scan.overallBand,
    skinType: scan.skinType,
    strengths: scan.strengths,
    focus: scan.focus,
    patterns: scan.patterns,
    concerns: scan.concerns.map((c) => ({
      key: c.key,
      label: c.label,
      raw: c.raw,
      band: c.band,
      area: c.area,
      lever: c.lever,
    })),
    profile: { goals: profile.goals, sensitivities: profile.sensitivities },
    goal_alignment: ga,
    routine_skeleton: skeleton,
  };
  return (
    `Write the first-scan report as JSON for this measured data.\n\nDATA:\n${JSON.stringify(data)}` +
    (repairErrors.length
      ? `\n\nYour previous answer was rejected for these reasons. Fix ALL of them:\n- ${repairErrors.join('\n- ')}`
      : '')
  );
}

export async function generateSkinReport(
  agent: ObjectGenerator = skinAnalystAgent as unknown as ObjectGenerator,
  scan: NormalizedScan,
  profile: UserProfile,
  maxAttempts = 3
): Promise<ReportResult> {
  let errors: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await agent.generate(buildReportPrompt(scan, profile, errors), {
        structuredOutput: { schema: SkinReportSchema },
      });
      const v = validateReport(res.object, scan, profile);
      if (v.ok && v.report) {
        return { report: v.report, source: 'llm', attempts: attempt, errors: [] };
      }
      errors = v.errors;
    } catch (e) {
      errors = [`agent error: ${e instanceof Error ? e.message : String(e)}`];
    }
  }
  return { report: buildFallbackReport(scan, profile), source: 'fallback', attempts: maxAttempts, errors };
}
