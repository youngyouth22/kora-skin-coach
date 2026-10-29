import { CONCERNS, isConcernKey, type ConcernKey } from './concerns.ts';
import type { NormalizedScan } from './normalize-scan.ts';

export type Alignment = 'strong' | 'partial' | 'weak' | 'not_measurable';
export interface GoalAlignment { goal: string; concern: ConcernKey | null; alignment: Alignment; value: number }

/** "Main Goal Validation": does the scan support the user's chosen goal?
 *  A low score on the goal's concern = strong alignment (the goal is justified). A high score = weak (already a strength). */
export function goalAlignment(goal: string, scan: NormalizedScan): GoalAlignment {
  if (!isConcernKey(goal) || !(goal in scan.evidence)) return { goal, concern: null, alignment: 'not_measurable', value: 0 };
  const raw = scan.evidence[goal];
  const value = Math.round(Math.min(1, Math.max(0, (75 - raw) / 40)) * 100) / 100;   // raw 35 -> 1, raw 75+ -> 0
  const alignment: Alignment = value >= 0.6 ? 'strong' : value >= 0.25 ? 'partial' : 'weak';
  return { goal, concern: goal, alignment, value };
}
export const goalLabel = (g: string) => (isConcernKey(g) ? CONCERNS[g].label : g);
