// Deterministic report: used when the LLM fails validation, and as the golden reference for tests.
// It proves the "wow" screen can ALWAYS be rendered from YouCam data alone; the LLM only improves the wording.
import type { NormalizedScan } from './normalize-scan.ts';
import { CONCERNS, BAND_LABEL, type ConcernKey } from './concerns.ts';
import { goalAlignment, goalLabel } from './goal-alignment.ts';
import { buildRoutineSkeleton, type UserProfile } from './routine-skeleton.ts';
import { KB_BY_ID } from '../kb/kb.ts';
import type { SkinReport } from './skin-report.schema.ts';

const STRENGTH_TEXT: Partial<Record<ConcernKey, [string, string]>> = {
  acne: ['Clear Complexion', 'Your skin is free of active breakouts, showing natural clarity and balance.'],
  redness: ['Protective Barrier', 'Your skin demonstrates resilience, efficiently defending against environmental stress while maintaining comfort.'],
  firmness: ['Firm Foundation', 'Your skin displays strong structural support and natural elasticity.'],
  radiance: ['Radiant Vitality', 'Your skin displays a bright and energetic tone, giving a strong base for maintaining a fresh, healthy appearance.'],
  texture: ['Smooth Refinement', 'Your skin surface looks notably even, smooth, and well-textured.'],
  pore: ['Refined Pores', 'Pores look small, clean, and well-managed across the surface.'],
  age_spot: ['Even Tone', 'Your skin shows strong pigment balance with very little visible discoloration.'],
  wrinkle: ['Youthful Smoothness', 'Few visible fine lines, reflecting well-maintained suppleness.'],
  dark_circle_v2: ['Bright Under-Eyes', 'Your eye contour appears naturally bright and well-rested.'],
  droopy_upper_eyelid: ['Open Eye Contour', 'Upper eyelids show good tone and natural support.'],
  moisture: ['Deep Hydration', 'Your skin holds water effectively, maintaining natural bounce.'],
  oiliness: ['Balanced Sebum', 'Your skin maintains a comfortable, balanced oil level throughout the day.'],
};
const n = (x: number) => Math.round(x);
const list = (s: NormalizedScan, keys: ConcernKey[]) => keys.map((k) => `${CONCERNS[k].label} ${n(s.evidence[k])}`).join(', ');

export function buildFallbackReport(scan: NormalizedScan, profile: UserProfile): SkinReport {
  const p = scan.patterns;
  const headline = p.includes('calm_and_clear') && p.includes('hydration_priority') ? 'Calm, clear skin that is asking for more hydration'
    : p.includes('calm_and_clear') ? 'Calm, clear skin with a strong foundation'
    : p.includes('hydration_priority') ? 'Your skin needs hydration first' : 'Your skin snapshot: a clear starting point';

  const regions: SkinReport['regions'] = [];
  const eyeKeys = scan.concerns.filter((c) => c.area === 'eye_area' && c.raw < 60).map((c) => c.key).slice(0, 3);
  if (eyeKeys.length) regions.push({
    area: 'eye_area', title: 'Eye area', confidence: 'measured',
    observation: `${list(scan, eyeKeys)}.`,
    why_it_matters: 'Puffiness and eyelid laxity are mostly structural, so skincare can soften the look but not change the shape.',
    suggested_focus: 'Gentle eye care with caffeine, sunscreen around the eyes and regular sleep.',
    evidence: eyeKeys.map((k) => ({ concern: k, raw: scan.evidence[k] })),
  });
  const bal = (['moisture', 'oiliness'] as ConcernKey[]).filter((k) => (scan.evidence[k] ?? 100) < 60);
  if (bal.length) regions.push({
    area: 'whole_face', title: 'Skin balance', confidence: 'measured',
    observation: `${list(scan, bal)}${scan.skinType.whole ? `. Skin type measured: ${scan.skinType.whole.toLowerCase()}` : ''}.`,
    why_it_matters: 'Oil and water are different things: oily skin can still be dehydrated, and over-stripping makes both worse.',
    suggested_focus: 'Hydrate first with a gentle, non-stripping routine.',
    evidence: bal.map((k) => ({ concern: k, raw: scan.evidence[k] })),
  });

  const strengths = scan.strengths.map((k) => ({
    title: (STRENGTH_TEXT[k]?.[0] ?? `${CONCERNS[k].label} is a strength`), description: STRENGTH_TEXT[k]?.[1] ?? `${CONCERNS[k].label} looks good.`,
    evidence: [{ concern: k, raw: scan.evidence[k] }],
  }));

  const chips: SkinReport['profile_chips'] = [];
  if (scan.skinType.whole) chips.push({ label: scan.skinType.whole, sublabel: 'Skin type', kind: 'skin_type' });
  for (const k of scan.focus.slice(0, 2)) chips.push({ label: CONCERNS[k].label, sublabel: BAND_LABEL[scan.concerns.find((c) => c.key === k)!.band], kind: 'concern' });
  for (const g of profile.goals.slice(0, 1)) {
    const dup = chips.find((c) => c.label === goalLabel(g));           // never show the same label twice
    if (dup) dup.sublabel = 'Focus · your goal'; else chips.push({ label: goalLabel(g), sublabel: 'Your goal', kind: 'goal' });
  }
  if (profile.sensitivities.includes('reactive')) chips.push({ label: 'Sensitive', sublabel: 'Skin reactivity', kind: 'sensitivity' });
  while (chips.length < 2) chips.push({ label: `${n(scan.overall)}/100`, sublabel: 'Overall', kind: 'concern' });

  const g = goalAlignment(profile.goals[0] ?? '', scan);
  const gText = g.alignment === 'strong' ? `Your scan strongly aligns with this goal: ${goalLabel(g.goal)} scored ${n(scan.evidence[g.goal])}. Your program is tailored to support this while adapting as you progress.`
    : g.alignment === 'partial' ? `${goalLabel(g.goal)} scored ${n(scan.evidence[g.goal])}: there is room for progress, balanced with your other scan priorities.`
    : g.alignment === 'weak' ? `${goalLabel(g.goal)} already scored ${n(scan.evidence[g.goal])} (a strength). We protect this while focusing on primary needs.`
    : 'This goal cannot be measured directly from the photo, so we will track it with your regular check-ins.';

  const routine = buildRoutineSkeleton(scan, profile).map((s) => ({
    step: s.step, name: s.name, time_of_day: s.time_of_day, ingredient_ids: s.ingredient_ids,
    instruction: s.frequency, why: s.caution ?? `Supports ${s.why_data.map((c) => CONCERNS[c].label.toLowerCase()).join(', ') || 'your skin barrier'}.`,
  }));
  void KB_BY_ID;

  return {
    headline,
    summary: `Overall ${n(scan.overall)}/100 on your first scan. Strengths: ${scan.strengths.map((k) => CONCERNS[k].label.toLowerCase()).join(', ')}. Focus: ${scan.focus.map((k) => CONCERNS[k].label.toLowerCase()).join(', ')}.`.slice(0, 280),
    overall: { score: scan.overall, band: scan.overallBand, caption: 'Your starting point, not a verdict.' },
    regions, strengths: strengths.length ? strengths : [{ title: 'A solid base', description: 'Your first scan sets a clear baseline to build from.', evidence: [{ concern: scan.concerns[0].key, raw: scan.concerns[0].raw }] }],
    profile_chips: chips.slice(0, 5),
    goal_validation: { goal: g.goal, alignment: g.alignment, value: g.value, explanation: gText },
    routine_preview: routine.length >= 3 ? routine : [...routine, ...Array(3 - routine.length).fill(routine[0])].slice(0, 3),
    coach_message: 'Start simple: hydrate, protect, and add only one new active. I will track every change with you.',
    disclaimers: ['Estimates from a photo, not medical advice.'],
    safety: { needs_professional_review: false, reasons: [] },
  };
}
