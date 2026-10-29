import seed from './ingredients.seed.json' with { type: 'json' };
import type { ConcernKey } from '../domain/concerns.ts';

export type PregnancyStatus = 'generally_ok' | 'ask_clinician' | 'avoid';
export interface Ingredient {
  id: string;
  name: string;
  aliases: string[];
  class: string;
  evidence: string;
  typical_strength: string;
  time_of_day: 'am' | 'pm' | 'both';
  helps_with: ConcernKey[];
  cautions: string[];
  pregnancy: PregnancyStatus;
  avoid_same_routine: string[];
  pairs_well_with: string[];
  ramp: string;
  skin_of_color_note: string;
  availability: 'otc' | 'rx' | 'varies';
  agent_may_recommend: boolean;
  review_status: string;
  citations: string[];
}

export const KB: Ingredient[] = (seed as { ingredients: unknown[] }).ingredients as Ingredient[];
export const KB_BY_ID: Map<string, Ingredient> = new Map(KB.map((i) => [i.id, i]));
export const kbIds = () => [...KB_BY_ID.keys()];
export const isRetinoidClass = (i: Ingredient) => i.class === 'retinoid';
