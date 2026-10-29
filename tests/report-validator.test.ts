import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromYoucamResult } from '../src/mastra/domain/normalize-scan.ts';
import { buildFallbackReport } from '../src/mastra/domain/fallback-report.ts';
import { validateReport } from '../src/mastra/domain/report-validator.ts';
import { SkinReportSchema } from '../src/mastra/domain/skin-report.schema.ts';
import type { UserProfile } from '../src/mastra/domain/routine-skeleton.ts';

const fixtureJson = JSON.parse(
  readFileSync(new URL('../fixtures/youcam_scan_001.json', import.meta.url), 'utf-8')
);

const testProfile: UserProfile = {
  goals: ['moisture', 'radiance'],
  sensitivities: [],
  currentActives: [],
  onPrescription: false,
  skinToneSelf: 3,
  ageRange: [25, 34],
};

test('fromYoucamResult computes honest raw score average and ignores inflated provider overall', () => {
  const scan = fromYoucamResult(fixtureJson);

  // In fixture, provider's inflated overall is 75.13
  assert.strictEqual(scan.providerOverallIgnored, 75.13);

  // Mean of the 12 concerns raw scores:
  // (88.5 + 62 + 78 + 71.5 + 58 + 82 + 42 + 52 + 74 + 79 + 64 + 81) / 12 = 832 / 12 = 69.333... => round1 = 69.3
  assert.strictEqual(scan.overall, 69.3);
  assert.strictEqual(scan.overallBand, 'moderate');
  assert.strictEqual(scan.skinType.whole, 'Combination');
  assert.strictEqual(scan.skinType.zones.t_zone, 'Oily');
  assert.ok(scan.concerns.length >= 10);
  assert.ok(scan.strengths.includes('acne'));
  assert.ok(scan.focus.includes('moisture'));
});

test('buildFallbackReport produces valid schema-compliant SkinReport', () => {
  const scan = fromYoucamResult(fixtureJson);
  const fallback = buildFallbackReport(scan, testProfile);

  // Safe parse against Zod schema
  const parsed = SkinReportSchema.safeParse(fallback);
  assert.strictEqual(parsed.success, true);

  // Validate with domain quality gate
  const validation = validateReport(fallback, scan, testProfile);
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(validation.errors.length, 0);
  assert.strictEqual(fallback.overall.score, scan.overall);
});

test('validateReport rejects ungrounded scores, banned words, and structural promises', () => {
  const scan = fromYoucamResult(fixtureJson);
  const validReport = buildFallbackReport(scan, testProfile);

  // 1. Invented score
  const badScoreReport = JSON.parse(JSON.stringify(validReport));
  badScoreReport.headline = 'Your overall skin score is 99/100 points!';
  const val1 = validateReport(badScoreReport, scan, testProfile);
  assert.strictEqual(val1.ok, false);
  assert.ok(val1.errors.some((e) => e.includes('not a measured score')));

  // 2. Banned medical/shaming words
  const bannedWordReport = JSON.parse(JSON.stringify(validReport));
  bannedWordReport.summary = 'We diagnose your severe acne and cure your flaws.';
  const val2 = validateReport(bannedWordReport, scan, testProfile);
  assert.strictEqual(val2.ok, false);
  assert.ok(val2.errors.some((e) => e.includes('banned wording')));

  // 3. Structural promises (promising to eliminate eye bags)
  const structuralPromiseReport = JSON.parse(JSON.stringify(validReport));
  const eyeRegion = structuralPromiseReport.regions.find((r: any) => r.area === 'eye_area');
  if (eyeRegion) {
    eyeRegion.suggested_focus = 'This cream will eliminate and reverse your eye bags completely.';
    const val3 = validateReport(structuralPromiseReport, scan, testProfile);
    assert.strictEqual(val3.ok, false);
    assert.ok(val3.errors.some((e) => e.includes('promises to change a structural concern')));
  }
});
