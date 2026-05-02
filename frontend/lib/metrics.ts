export type MetricId = "ctl" | "atl" | "tsb" | "tss_week" | "tss_day" | "zone_load";

export type MetricMeta = {
  id: MetricId;
  label: string;
  abbr: string;
  title: string;
};

export const METRICS: Record<MetricId, MetricMeta> = {
  ctl: {
    id: "ctl",
    label: "Fitness",
    abbr: "CTL",
    title:
      "CTL · Chronic Training Load. Your long-term fitness trend. Higher = fitter, but build it gradually — sustainable progression is roughly 3–7% per week.",
  },
  atl: {
    id: "atl",
    label: "Fatigue",
    abbr: "ATL",
    title:
      "ATL · Acute Training Load. Short-term fatigue from the last ~7 days. High after hard weeks is normal; persistent high without recovery is a risk.",
  },
  tsb: {
    id: "tsb",
    label: "Form",
    abbr: "TSB",
    title:
      "TSB · Training Stress Balance. Fitness minus fatigue. Negative = absorbing training (you're building). Near zero = recovered. +5 to +25 = race-ready window.",
  },
  tss_week: {
    id: "tss_week",
    label: "Weekly TSS",
    abbr: "TSS",
    title:
      "TSS · Training Stress Score for the week. Sums effort × duration across all rides. Compare against the dashed average line — sustained jumps drive both fitness and fatigue.",
  },
  tss_day: {
    id: "tss_day",
    label: "Daily TSS",
    abbr: "TSS",
    title:
      "TSS · Daily Training Stress Score. Color intensity scales with effort; empty cells are rest days, which are part of how fitness consolidates.",
  },
  zone_load: {
    id: "zone_load",
    label: "Zone load",
    abbr: "TSS by zone",
    title:
      "TSS by intensity zone. A healthy base typically has more Endurance/Tempo than Threshold/VO2 work — the inverse signals high-intensity bias.",
  },
};
