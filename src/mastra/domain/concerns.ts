// Catalog of the skin concerns returned by YouCam Skin Analysis (SD), with product semantics.
// Source of truth for labels, areas and how "fixable" each concern is by skincare.
// Score semantics (verified on a real result): raw_score 0-100, HIGHER = BETTER for every concern
// (acne 100 = no acne; moisture 37 = poorly hydrated; oiliness 45 = oilier than balanced).

export type ConcernKey =
  | 'acne' | 'redness' | 'age_spot' | 'texture' | 'pore' | 'wrinkle' | 'moisture' | 'oiliness'
  | 'radiance' | 'firmness' | 'dark_circle_v2' | 'eye_bag' | 'tear_trough'
  | 'droopy_upper_eyelid' | 'droopy_lower_eyelid';

export type Area = 'whole_face' | 'eye_area';
/** How much a skincare routine can realistically change the concern. Never over-promise 'structural'. */
export type Lever = 'topical' | 'topical_limited' | 'mixed' | 'structural';
export type Category = 'blemish' | 'tone' | 'texture' | 'hydration' | 'aging' | 'eye';

export interface ConcernMeta { label: string; area: Area; category: Category; lever: Lever; blurb: string }

export const CONCERNS: Record<ConcernKey, ConcernMeta> = {
  acne:                { label: 'Acne',            area: 'whole_face', category: 'blemish',   lever: 'topical',         blurb: 'Active breakouts and blemishes' },
  redness:             { label: 'Redness',         area: 'whole_face', category: 'tone',      lever: 'topical',         blurb: 'Visible redness and irritation' },
  age_spot:            { label: 'Dark spots',      area: 'whole_face', category: 'tone',      lever: 'topical',         blurb: 'Pigmentation and sun spots' },
  texture:             { label: 'Texture',         area: 'whole_face', category: 'texture',   lever: 'topical',         blurb: 'Smoothness of the skin surface' },
  pore:                { label: 'Pores',           area: 'whole_face', category: 'texture',   lever: 'topical_limited', blurb: 'Visible pore size' },
  wrinkle:             { label: 'Wrinkles',        area: 'whole_face', category: 'aging',     lever: 'topical_limited', blurb: 'Fine lines and wrinkles' },
  moisture:            { label: 'Hydration',       area: 'whole_face', category: 'hydration', lever: 'topical',         blurb: 'Water content of the skin' },
  oiliness:            { label: 'Oil balance',     area: 'whole_face', category: 'hydration', lever: 'topical',         blurb: 'Sebum level (lower score = oilier)' },
  radiance:            { label: 'Radiance',        area: 'whole_face', category: 'tone',      lever: 'topical',         blurb: 'Glow and evenness of tone' },
  firmness:            { label: 'Firmness',        area: 'whole_face', category: 'aging',     lever: 'topical_limited', blurb: 'Skin elasticity and support' },
  dark_circle_v2:      { label: 'Dark circles',    area: 'eye_area',   category: 'eye',       lever: 'mixed',           blurb: 'Discoloration under the eyes' },
  eye_bag:             { label: 'Eye bags',        area: 'eye_area',   category: 'eye',       lever: 'structural',      blurb: 'Puffiness under the eyes' },
  tear_trough:         { label: 'Tear troughs',    area: 'eye_area',   category: 'eye',       lever: 'structural',      blurb: 'Hollowing under the eyes' },
  droopy_upper_eyelid: { label: 'Upper eyelids',   area: 'eye_area',   category: 'eye',       lever: 'structural',      blurb: 'Upper eyelid drooping' },
  droopy_lower_eyelid: { label: 'Lower eyelids',   area: 'eye_area',   category: 'eye',       lever: 'structural',      blurb: 'Lower eyelid laxity' },
};

export const isConcernKey = (k: string): k is ConcernKey => k in CONCERNS;

export type Band = 'strength' | 'good' | 'moderate' | 'watch' | 'focus';
/** Starting thresholds (hypothesis, tune with real data). Labels are deliberately non-judgmental. */
export function bandOf(raw: number): Band {
  if (raw >= 85) return 'strength';
  if (raw >= 70) return 'good';
  if (raw >= 55) return 'moderate';
  if (raw >= 40) return 'watch';
  return 'focus';
}
export const BAND_LABEL: Record<Band, string> = {
  strength: 'Strength', good: 'Good', moderate: 'Moderate', watch: 'Area to watch', focus: 'Focus area',
};
