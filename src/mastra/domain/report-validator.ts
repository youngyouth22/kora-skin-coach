import { SkinReportSchema, type SkinReport } from './skin-report.schema.ts';
import type { NormalizedScan } from './normalize-scan.ts';
import { CONCERNS, isConcernKey } from './concerns.ts';
import { goalAlignment } from './goal-alignment.ts';
import { buildRoutineSkeleton, conflicts, ingredientAllowed, type UserProfile } from './routine-skeleton.ts';
import { KB_BY_ID } from '../kb/kb.ts';

const BANNED: [RegExp, string][] = [
  [/\bdiagnos/i, 'medical diagnosis wording'], [/\b(cure|cures|cured|heal your|treats?)\b/i, 'treatment/cure claim'],
  [/\b(flaws?|ugly|bad skin|problem (skin|areas?)|imperfections?)\b/i, 'shaming wording'], [/\bguarantee/i, 'guarantee claim'],
  [/clinically proven|dermatologist[- ](approved|tested|recommended)/i, 'unverifiable claim'], [/skin age|years older/i, 'skin age mention'],
];
const STRUCTURAL_PROMISE = /\b(eliminate|erase|remove|get rid|fix|reverse|lift)\b/i;

export function validateReport(raw: unknown, scan: NormalizedScan, profile: UserProfile): { ok: boolean; errors: string[]; report?: SkinReport } {
  const parsed = SkinReportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 6).map((i) => `schema: ${i.path.join('.')} ${i.message}`) };
  const r = parsed.data, errors: string[] = [];

  // 1) every evidence ref matches a measured score
  const refs = [...r.regions.flatMap((x) => x.evidence), ...r.strengths.flatMap((x) => x.evidence)];
  for (const e of refs) {
    const m = scan.evidence[e.concern];
    if (m === undefined) errors.push(`evidence: unknown concern "${e.concern}"`);
    else if (Math.abs(m - e.raw) > 0.1) errors.push(`evidence: ${e.concern} raw ${e.raw} does not match measured ${m}`);
  }
  if (Math.abs(r.overall.score - scan.overall) > 0.1) errors.push(`overall score ${r.overall.score} must be ${scan.overall}`);

  // 2) numbers quoted in prose must be real scores
  const allowed = new Set<number>([Math.round(scan.overall), ...Object.values(scan.evidence).map(Math.round), 100]);
  const prose = [r.headline, r.summary, r.coach_message, r.goal_validation.explanation, ...r.regions.flatMap((x) => [x.observation, x.why_it_matters, x.suggested_focus]),
    ...r.strengths.map((x) => x.description), ...r.routine_preview.flatMap((x) => [x.instruction, x.why])].join(' \n ');
  for (const m of prose.matchAll(/\b(\d{1,3})(?:\.\d)?\s*(?:\/\s*100|points?)\b/g)) if (!allowed.has(Number(m[1]))) errors.push(`prose quotes ${m[1]} which is not a measured score`);

  // 3) wording
  for (const [re, why] of BANNED) if (re.test(prose)) errors.push(`banned wording: ${why}`);

  // 4) regions only where data supports them
  for (const g of r.regions) {
    if (g.confidence === 'zone_measured') errors.push(`region ${g.area}: zone analytics not available in v1`);
    if (['forehead', 'cheeks', 'chin', 'nose'].includes(g.area)) errors.push(`region ${g.area}: not measurable from SD data`);
    if (g.area === 'eye_area' && g.evidence.some((e) => !isConcernKey(e.concern) || CONCERNS[e.concern].area !== 'eye_area')) errors.push('eye_area evidence must be eye-area concerns');
    if (g.evidence.some((e) => isConcernKey(e.concern) && CONCERNS[e.concern].lever === 'structural') && STRUCTURAL_PROMISE.test(g.suggested_focus)) errors.push(`region ${g.title}: promises to change a structural concern`);
  }

  // 5) goal validation is deterministic
  const ga = goalAlignment(r.goal_validation.goal, scan);
  if (ga.alignment !== r.goal_validation.alignment || Math.abs(ga.value - r.goal_validation.value) > 0.01) errors.push(`goal_validation must be ${ga.alignment} / ${ga.value}`);

  // 6) routine: same steps and ingredients as the deterministic skeleton; all allowed; no conflicts
  const skel = buildRoutineSkeleton(scan, profile);
  const ids = r.routine_preview.flatMap((s) => s.ingredient_ids);
  const skelIds = new Set(skel.flatMap((s) => s.ingredient_ids));
  for (const id of ids) {
    const ing = KB_BY_ID.get(id);
    if (!ing) { errors.push(`routine: unknown ingredient "${id}"`); continue; }
    if (!skelIds.has(id)) errors.push(`routine: "${id}" is not in the allowed routine skeleton`);
    const a = ingredientAllowed(ing, profile); if (!a.ok) errors.push(`routine: ${a.reason}`);
  }
  if (r.routine_preview.length !== skel.length) errors.push(`routine must have exactly ${skel.length} steps`);
  for (const [a, b] of conflicts(ids)) errors.push(`routine: ${a} conflicts with ${b}`);

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], report: r };
}
