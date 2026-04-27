import type { Activity, DashboardResponse } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function loadFor(activity: Pick<Activity, "tss" | "estimated_load">) {
  return activity.tss ?? activity.estimated_load ?? 0;
}

export function buildDailyTss(activities: Activity[], days = 84): number[] {
  const today = startOfDay(new Date());
  const start = today.getTime() - (days - 1) * DAY_MS;
  const arr = new Array(days).fill(0) as number[];
  for (const a of activities) {
    const d = startOfDay(new Date(a.started_at)).getTime();
    if (d < start || d > today.getTime()) continue;
    const idx = Math.round((d - start) / DAY_MS);
    if (idx >= 0 && idx < days) {
      arr[idx] += loadFor(a);
    }
  }
  return arr;
}

function ema(values: number[], tau: number): number[] {
  if (values.length === 0) return [];
  const alpha = 1 - Math.exp(-1 / tau);
  const out: number[] = [];
  let prev = 0;
  for (const v of values) {
    const next = prev + alpha * (v - prev);
    out.push(next);
    prev = next;
  }
  return out;
}

export type FormSeries = {
  ctl: number[];
  atl: number[];
  tsb: number[];
  ctlNow: number;
  atlNow: number;
  tsbNow: number;
};

export function computeFormSeries(daily: number[]): FormSeries {
  const ctlRaw = ema(daily, 42);
  const atlRaw = ema(daily, 7);
  const ctl = ctlRaw.map((v) => Math.round(v * 10) / 10);
  const atl = atlRaw.map((v) => Math.round(v * 10) / 10);
  const tsb = ctl.map((c, i) => Math.round((c - atl[i]) * 10) / 10);
  return {
    ctl,
    atl,
    tsb,
    ctlNow: ctl[ctl.length - 1] ?? 0,
    atlNow: atl[atl.length - 1] ?? 0,
    tsbNow: tsb[tsb.length - 1] ?? 0
  };
}

export type Verdict = {
  label: "Building" | "Maintaining" | "Detraining" | "Recovering";
  qualifier: string;
  headline: string;
  detail: string;
};

export function deriveVerdict(form: FormSeries, weekly: DashboardResponse["analysis"]["weekly"]): Verdict {
  const ctlPrior = form.ctl.length >= 28 ? form.ctl[form.ctl.length - 28] : form.ctl[0] ?? form.ctlNow;
  const ctlChange = ctlPrior > 0 ? ((form.ctlNow - ctlPrior) / ctlPrior) * 100 : 0;
  const recentWeek = weekly[weekly.length - 1]?.load ?? 0;
  const priorAvg =
    weekly.length > 1
      ? weekly.slice(0, -1).reduce((a, b) => a + b.load, 0) / Math.max(1, weekly.length - 1)
      : 0;

  if (form.tsbNow < -15 && ctlChange > 4) {
    return {
      label: "Building",
      qualifier: "Productive overload",
      headline: "Fitness rising, form deeply negative.",
      detail: `CTL up ${ctlChange.toFixed(0)}% vs 4 weeks ago · last week ${Math.round(recentWeek)} TSS vs ${Math.round(priorAvg)} avg.`
    };
  }
  if (form.tsbNow > 5 && ctlChange < 1) {
    return {
      label: "Recovering",
      qualifier: "Form rebuilding",
      headline: "Form positive — race-ready window opening.",
      detail: `TSB ${form.tsbNow.toFixed(0)} · CTL ${ctlChange >= 0 ? "+" : ""}${ctlChange.toFixed(0)}% over 4 weeks.`
    };
  }
  if (ctlChange > 2) {
    return {
      label: "Building",
      qualifier: "Steady progression",
      headline: "Fitness trending up.",
      detail: `CTL up ${ctlChange.toFixed(0)}% in 4 weeks · TSB ${form.tsbNow.toFixed(0)}.`
    };
  }
  if (ctlChange < -3) {
    return {
      label: "Detraining",
      qualifier: "Load below maintenance",
      headline: "Fitness slipping.",
      detail: `CTL ${ctlChange.toFixed(0)}% over 4 weeks · last week ${Math.round(recentWeek)} TSS.`
    };
  }
  return {
    label: "Maintaining",
    qualifier: "Holding fitness",
    headline: "Steady-state load.",
    detail: `CTL ${ctlChange >= 0 ? "+" : ""}${ctlChange.toFixed(0)}% in 4 weeks · TSB ${form.tsbNow.toFixed(0)}.`
  };
}

export function buildZoneRows(zones: DashboardResponse["analysis"]["zone_breakdown"]) {
  const entries = Object.entries(zones);
  const total = entries.reduce((a, [, v]) => a + v.load, 0) || 1;
  return entries.map(([key, v]) => ({
    key,
    load: v.load,
    count: v.count,
    pct: Math.round((v.load / total) * 100)
  }));
}
