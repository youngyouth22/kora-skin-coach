import { bandOf, CONCERNS, isConcernKey, type Band, type ConcernKey } from './concerns.ts';

export interface NormalizedConcern {
  key: ConcernKey; label: string; raw: number; band: Band;
  area: 'whole_face' | 'eye_area'; lever: string; category: string; rank: number; // rank 1 = best score
}
export type Pattern =
  | 'oily_dehydrated' | 'calm_and_clear' | 'eye_area_focus' | 'hydration_priority' | 'pigment_watch' | 'firm_skin';

export interface NormalizedScan {
  overall: number;                 // HONEST: mean of raw scores (never the provider's inflated "all")
  overallBand: Band;
  providerOverallIgnored: number | null;
  skinAge: number | null;          // an ESTIMATE; see shouldShowSkinAge()
  skinType: { whole: string | null; zones: Record<string, string> };
  concerns: NormalizedConcern[];   // sorted best -> worst
  strengths: ConcernKey[];         // top scores >= 75 (max 3)
  focus: ConcernKey[];             // lowest scores < 60 (max 3), excluding nothing: structural ones are flagged by lever
  patterns: Pattern[];
  evidence: Record<string, number>; // concern key -> raw score rounded to 1 decimal; every claim must cite these
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Build from a YouCam v2.0 skin-analysis result body (or its `data`). */
export function fromYoucamResult(body: any): NormalizedScan {
  const data = body?.data ?? body;
  const out: any[] = Array.isArray(data?.results?.output) ? data.results.output : [];
  const raws: Partial<Record<ConcernKey, number>> = {};
  let providerOverall: number | null = null, skinAge: number | null = null;
  const zones: Record<string, string> = {};
  for (const it of out) {
    const t = String(it?.type ?? '');
    if (t === 'all') providerOverall = typeof it.score === 'number' ? it.score : null;
    else if (t === 'skin_age') skinAge = typeof it.score === 'number' ? it.score : null;
    else if (t === 'skin_type') { if (typeof it.skin_type === 'string') zones[it.region ?? 'whole'] = it.skin_type; }
    else if (isConcernKey(t) && typeof it.raw_score === 'number') raws[t] = it.raw_score;   // never ui_score
  }
  return buildNormalizedScan(raws, { skinAge, zones, providerOverall });
}

/** Build from our database rows (scans + scan_concerns, whole-face rows only). */
export function fromDbRows(
  concernRows: { concern: string; raw_score: number; zone?: string | null }[],
  scan: { skin_age?: number | null; skin_type?: Record<string, string> | null },
): NormalizedScan {
  const raws: Partial<Record<ConcernKey, number>> = {};
  for (const r of concernRows) if (isConcernKey(r.concern) && (!r.zone || r.zone === 'whole')) raws[r.concern] = Number(r.raw_score);
  return buildNormalizedScan(raws, { skinAge: scan.skin_age ?? null, zones: scan.skin_type ?? {}, providerOverall: null });
}

export function buildNormalizedScan(
  raws: Partial<Record<ConcernKey, number>>,
  extra: { skinAge: number | null; zones: Record<string, string>; providerOverall: number | null },
): NormalizedScan {
  const entries = Object.entries(raws) as [ConcernKey, number][];
  if (entries.length === 0) throw new Error('No concern scores to normalize');
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const concerns: NormalizedConcern[] = sorted.map(([key, raw], i) => ({
    key, label: CONCERNS[key].label, raw: round1(raw), band: bandOf(raw), area: CONCERNS[key].area,
    lever: CONCERNS[key].lever, category: CONCERNS[key].category, rank: i + 1,
  }));
  const overall = round1(entries.reduce((s, [, v]) => s + v, 0) / entries.length);
  const get = (k: ConcernKey) => raws[k];
  const patterns: Pattern[] = [];
  const whole = extra.zones.whole ?? null;
  if ((whole ?? '').toLowerCase() === 'oily' && (get('moisture') ?? 100) < 50) patterns.push('oily_dehydrated');
  if ((get('redness') ?? 0) >= 85 && (get('acne') ?? 0) >= 85) patterns.push('calm_and_clear');
  if (concerns.filter((c) => c.area === 'eye_area' && c.raw < 55).length >= 2) patterns.push('eye_area_focus');
  if ((get('moisture') ?? 100) < 50) patterns.push('hydration_priority');
  if ((get('age_spot') ?? 100) < 60 || (get('dark_circle_v2') ?? 100) < 55) patterns.push('pigment_watch');
  if ((get('firmness') ?? 0) >= 80 && (get('wrinkle') ?? 0) >= 60) patterns.push('firm_skin');
  return {
    overall, overallBand: bandOf(overall), providerOverallIgnored: extra.providerOverall, skinAge: extra.skinAge,
    skinType: { whole, zones: extra.zones }, concerns,
    strengths: concerns.filter((c) => c.raw >= 75).slice(0, 3).map((c) => c.key),
    focus: [...concerns].reverse().filter((c) => c.raw < 60).slice(0, 3).map((c) => c.key),
    patterns,
    evidence: Object.fromEntries(concerns.map((c) => [c.key, c.raw])),
  };
}

/** Skin age is an estimate that can hurt: show it only when we know the user's age range and the gap is plausible. */
export function shouldShowSkinAge(skinAge: number | null, ageRange: [number, number] | null): boolean {
  if (skinAge === null || ageRange === null) return false;
  const mid = (ageRange[0] + ageRange[1]) / 2;
  return Math.abs(skinAge - mid) <= 10;
}
