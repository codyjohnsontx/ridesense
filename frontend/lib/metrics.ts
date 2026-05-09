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
      "CTL · Chronic Training Load. A long-term load proxy built from roughly 42 days of scored training stress. Watch the week-to-week ramp, not just the absolute value.",
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
    label: "Readiness",
    abbr: "TSB",
    title:
      "TSB · Training Stress Balance. Here it is shown as next-day readiness: positive means fresher, negative means more residual fatigue. Useful as context, not a guarantee.",
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
    label: "Workout mix",
    abbr: "Load by category",
    title:
      "Load by workout category, not true time in zone. Use it to see how the block is distributed across workout types, then judge whether that mix fits the goal of the block.",
  },
};
