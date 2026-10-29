// Deterministic routine skeleton: the LLM may explain and personalize it, but never invents or swaps ingredients.
import { KB_BY_ID, type Ingredient } from "../kb/kb.ts";
import type { NormalizedScan } from "./normalize-scan.ts";
import type { ConcernKey } from "./concerns.ts";

export interface UserProfile {
  goals: ConcernKey[]; // max 3 (from onboarding)
  sensitivities: string[]; // 'reactive' | 'allergies' | 'pregnant_nursing' ...
  currentActives: string[]; // ingredient ids already used
  onPrescription: boolean; // true => never suggest retinoid/hydroquinone changes
  skinToneSelf: number | null; // 1..6
  ageRange: [number, number] | null;
}
export interface RoutineStep {
  step: number;
  name: string;
  category:
    | "cleanser"
    | "hydration"
    | "treatment"
    | "sunscreen"
    | "eye"
    | "optional_retinoid";
  time_of_day: "am" | "pm" | "both";
  ingredient_ids: string[];
  frequency: string;
  why_data: ConcernKey[];
  caution?: string;
}

export const isPregnantOrNursing = (p: UserProfile) =>
  p.sensitivities.includes("pregnant_nursing");
const reactive = (p: UserProfile) => p.sensitivities.includes("reactive");

/** Single gate every suggested ingredient must pass (also used by the validator). */
export function ingredientAllowed(
  ing: Ingredient,
  p: UserProfile,
): { ok: boolean; reason?: string } {
  if (!ing.agent_may_recommend)
    return {
      ok: false,
      reason: `${ing.name}: prescription/regulated, never recommended by the agent`,
    };
  if (isPregnantOrNursing(p) && ing.pregnancy !== "generally_ok")
    return {
      ok: false,
      reason: `${ing.name}: not suggested during pregnancy or nursing`,
    };
  if (p.onPrescription && ing.class === "retinoid")
    return {
      ok: false,
      reason: `${ing.name}: user already on a prescribed treatment`,
    };
  return { ok: true };
}

/** Pairs that must not be in the same routine (from avoid_same_routine). */
export function conflicts(ids: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const a of ids)
    for (const b of ids) {
      if (a >= b) continue;
      const A = KB_BY_ID.get(a),
        B = KB_BY_ID.get(b);
      if (!A || !B) continue;
      if (
        A.avoid_same_routine.includes(b) ||
        B.avoid_same_routine.includes(a) ||
        A.avoid_same_routine.includes(B.class) ||
        B.avoid_same_routine.includes(A.class)
      )
        out.push([a, b]);
    }
  return out;
}

export function buildRoutineSkeleton(
  scan: NormalizedScan,
  p: UserProfile,
): RoutineStep[] {
  const ev = scan.evidence;
  const steps: Omit<RoutineStep, "step">[] = [];
  const ok = (id: string) => {
    const i = KB_BY_ID.get(id);
    return !!i && ingredientAllowed(i, p).ok;
  };

  steps.push({
    name: "Gentle Cleansing",
    category: "cleanser",
    time_of_day: "both",
    ingredient_ids: [],
    frequency: "Morning and evening",
    why_data: ["oiliness", "moisture"],
    caution:
      "Choose a non-stripping, fragrance-free formula, especially if hydration is low.",
  });

  const dry = (ev.moisture ?? 100) < 60;
  if (dry) {
    const ids = ["hyaluronic_acid", "glycerin", "ceramides"].filter(ok);
    steps.push({
      name: "Hydration Support",
      category: "hydration",
      time_of_day: "both",
      ingredient_ids: ids,
      frequency: "Morning and evening",
      why_data: ["moisture"],
      caution:
        "Apply to slightly damp skin and seal with a light, non-comedogenic moisturizer.",
    });
  }

  // One targeted active at a time. Order of preference is driven by the user's goals, then by the weakest measured concerns.
  const wants = new Set<ConcernKey>([...p.goals, ...scan.focus]);
  const barrierFragile = (ev.moisture ?? 100) < 50 || reactive(p);
  let active: string | null = null;
  if (
    (wants.has("oiliness") ||
      wants.has("pore") ||
      wants.has("age_spot") ||
      wants.has("texture")) &&
    ok("niacinamide")
  )
    active = "niacinamide";
  else if ((wants.has("redness") || wants.has("acne")) && ok("azelaic_acid"))
    active = "azelaic_acid";
  else if (wants.has("radiance") && !barrierFragile && ok("vitamin_c"))
    active = "vitamin_c";
  else if (wants.has("acne") && !barrierFragile && ok("benzoyl_peroxide"))
    active = "benzoyl_peroxide";
  if (active) {
    const a = KB_BY_ID.get(active)!;
    steps.push({
      name: `Targeted Care: ${a.name}`,
      category: "treatment",
      time_of_day: a.time_of_day,
      ingredient_ids: [active],
      frequency: a.ramp,
      why_data: a.helps_with.filter((c) => c in ev) as ConcernKey[],
      caution: "Introduce only this one new active, then assess for 4-6 weeks.",
    });
  }

  const eyeWeak = scan.concerns.some(
    (c) =>
      c.area === "eye_area" &&
      c.raw < 60 &&
      (c.key === "eye_bag" || c.key === "dark_circle_v2"),
  );
  if (eyeWeak && ok("caffeine_eye")) {
    steps.push({
      name: "Eye-Area Care",
      category: "eye",
      time_of_day: "both",
      ingredient_ids: ["caffeine_eye"],
      frequency: "Morning, gently patted on",
      why_data: ["eye_bag", "dark_circle_v2"],
      caution:
        "Helps puffiness only temporarily; structural eye bags are not changed by skincare.",
    });
  }

  const spf = ok("zinc_oxide_spf")
    ? "zinc_oxide_spf"
    : ok("chemical_uv_filters")
      ? "chemical_uv_filters"
      : "zinc_oxide_spf";
  steps.push({
    name: "Sun Protection SPF 30+",
    category: "sunscreen",
    time_of_day: "am",
    ingredient_ids: [spf],
    frequency: "Every morning; reapply every 2 hours in direct sun",
    why_data: ["age_spot", "redness", "wrinkle"].filter(
      (c) => c in ev,
    ) as ConcernKey[],
    caution:
      p.skinToneSelf !== null && p.skinToneSelf >= 4
        ? "Tinted or sheer mineral formulas reduce white cast on deeper skin tones."
        : undefined,
  });

  // Retinoid only as an OPTIONAL later step, never alongside a new active, never in pregnancy or if on a prescription.
  const ret = ["retinol"].find(ok);
  if (ret && !barrierFragile && !active) {
    steps.push({
      name: "Retinoid Introduction (Optional)",
      category: "optional_retinoid",
      time_of_day: "pm",
      ingredient_ids: [ret],
      frequency: KB_BY_ID.get(ret)!.ramp,
      why_data: ["texture", "wrinkle", "acne"].filter(
        (c) => c in ev,
      ) as ConcernKey[],
      caution: "Only after 4 weeks of a stable routine.",
    });
  }
  return steps.slice(0, 6).map((s, i) => ({ ...s, step: i + 1 }));
}
