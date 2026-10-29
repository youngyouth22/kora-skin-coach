import { z } from 'zod';

const Evidence = z.object({ concern: z.string(), raw: z.number() });   // every claim cites the measured score it comes from
const Area = z.enum(['eye_area', 'whole_face', 'forehead', 'cheeks', 'chin', 'nose']);
// v1 only produces 'eye_area' and 'whole_face'. Face-zone areas need zone analytics (mask coverage per zone) or HD data.

export const SkinReportSchema = z.object({
  headline: z.string().min(8).max(80),
  summary: z.string().min(20).max(280),
  overall: z.object({ score: z.number(), band: z.enum(['strength', 'good', 'moderate', 'watch', 'focus']), caption: z.string().max(80) }),
  regions: z.array(z.object({
    area: Area, title: z.string().max(40),
    observation: z.string().max(220), why_it_matters: z.string().max(220), suggested_focus: z.string().max(200),
    confidence: z.enum(['measured', 'zone_measured']), evidence: z.array(Evidence).min(1).max(4),
  })).max(4),
  strengths: z.array(z.object({ title: z.string().max(40), description: z.string().max(160), evidence: z.array(Evidence).min(1).max(2) })).min(1).max(3),
  profile_chips: z.array(z.object({ label: z.string().max(24), sublabel: z.string().max(24), kind: z.enum(['skin_type', 'concern', 'goal', 'sensitivity']) })).min(2).max(5),
  goal_validation: z.object({
    goal: z.string(), alignment: z.enum(['strong', 'partial', 'weak', 'not_measurable']),
    value: z.number().min(0).max(1), explanation: z.string().max(260),
  }),
  routine_preview: z.array(z.object({
    step: z.number().int().min(1).max(6), name: z.string().max(60), time_of_day: z.enum(['am', 'pm', 'both']),
    ingredient_ids: z.array(z.string()), instruction: z.string().max(200), why: z.string().max(200),
  })).min(3).max(6),
  coach_message: z.string().min(10).max(220),
  disclaimers: z.array(z.string().max(120)).min(1).max(3),
  safety: z.object({ needs_professional_review: z.boolean(), reasons: z.array(z.string().max(120)).max(3) }),
});
export type SkinReport = z.infer<typeof SkinReportSchema>;
