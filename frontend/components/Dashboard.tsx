"use client";

import type { Activity, DashboardResponse, GroundedAnswer, TimeRange } from "@/lib/api";
import { buildDailyTss, buildZoneRows, computeFormSeries, deriveVerdict } from "@/lib/training";
import { FormFitnessCurve, WeekHeatmap, WeeklyLoadChart, ZoneStackBar } from "./charts";
import { Icon } from "./icons";
import { PageHeader } from "./Shell";
import { TimeRangeControl } from "./TimeRangeControl";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Delta, Input } from "./ui";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatLastSync(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function utcEndOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
}

function rangeEndDate(range: TimeRange, activities: Activity[]) {
  if (range.mode === "custom") return new Date(`${range.endDate}T23:59:59.999Z`);
  if (range.mode === "all" && activities.length > 0) {
    const latest = Math.max(...activities.map((a) => new Date(a.started_at).getTime()).filter(Number.isFinite));
    if (Number.isFinite(latest)) return utcEndOfDay(new Date(latest));
  }
  return utcEndOfDay(new Date());
}

export function Dashboard({
  dashboard,
  timeRange,
  rangeDays,
  onRangeChange,
  onSync,
  syncing,
  question,
  onQuestionChange,
  onAsk,
  asking,
  answer,
  activities,
  onExport,
  message,
  onClearMessage
}: {
  dashboard: DashboardResponse;
  timeRange: TimeRange;
  rangeDays: number;
  onRangeChange: (r: TimeRange) => void;
  onSync: () => void;
  syncing: boolean;
  question: string;
  onQuestionChange: (q: string) => void;
  onAsk: () => void;
  asking: boolean;
  answer: GroundedAnswer | null;
  activities: Activity[];
  onExport: () => void;
  message?: string;
  onClearMessage?: () => void;
}) {
  const topActivities = dashboard.analysis.top_workouts;
  const chartEndDate = rangeEndDate(timeRange, activities);
  const daily = buildDailyTss(activities, rangeDays, chartEndDate);
  const form = computeFormSeries(daily);
  const verdict = deriveVerdict(form, dashboard.analysis.weekly);
  const weekly = dashboard.analysis.weekly;
  const recentWeekLoad = Math.round(weekly[weekly.length - 1]?.load ?? dashboard.analysis.summary.latest_week_load);
  const priorCount = Math.max(0, weekly.length - 1);
  const priorAvg =
    priorCount > 0
      ? weekly.slice(0, -1).reduce((a, b) => a + b.load, 0) / priorCount
      : dashboard.analysis.summary.avg_weekly_load;
  const weekDeltaPct =
    priorAvg > 0 ? Math.round(((recentWeekLoad - priorAvg) / priorAvg) * 100) : dashboard.analysis.summary.trend_pct;
  const zoneRows = buildZoneRows(dashboard.analysis.zone_breakdown);
  const stravaCount = dashboard.analysis.provider_counts["strava"] ?? 0;
  const trainerRoadCount = dashboard.analysis.provider_counts["trainerroad"] ?? 0;

  const weekRange = (() => {
    const last = weekly[weekly.length - 1];
    if (!last) return "Last week";
    const start = new Date(last.week_start);
    const end = new Date(start.getTime() + 6 * 24 * 3600 * 1000);
    return `${start.toLocaleDateString("en-US", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short"
    })}`;
  })();

  return (
    <>
      <PageHeader
        eyebrow={timeRange.label}
        title="State of training"
        subtitle="Deterministic metrics first. AI interpretation second."
        right={
          <>
            <TimeRangeControl range={timeRange} onChange={onRangeChange} />
            <Button variant="outline" size="sm" onClick={onExport} disabled={activities.length === 0}>
              <Icon name="download" size={13} />
              Export
            </Button>
            <Button variant="default" size="sm" onClick={onSync} disabled={syncing}>
              <Icon name="zap" size={13} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 px-8 py-5">
        {message ? (
          <Card className="flex-row items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5 text-sm">
              <Icon name="info" size={14} />
              <span>{message}</span>
            </div>
            {onClearMessage ? (
              <Button variant="ghost" size="sm" onClick={onClearMessage}>
                Dismiss
              </Button>
            ) : null}
          </Card>
        ) : null}

        {/* Hero */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(420px,2.2fr)_minmax(220px,1fr)]">
          {/* Verdict */}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 px-6 py-5">
              <div className="flex items-center gap-2">
                <Badge variant="success" className="px-2 py-0.5">
                  ● {verdict.label}
                </Badge>
                <span className="text-xs text-muted-foreground">{verdict.qualifier}</span>
              </div>
              <h2
                className="m-0 font-semibold leading-[1.05] tracking-tight"
                style={{ fontSize: "clamp(22px, 2.6vw, 36px)", textWrap: "balance" }}
              >
                {verdict.headline}
              </h2>
              <p className="m-0 text-[13px] leading-snug text-muted-foreground">{verdict.detail}</p>
              <div className="grid grid-cols-3 gap-3.5 border-t border-border pt-3">
                {[
                  { label: "CTL", value: form.ctlNow, sub: "fitness", warn: false },
                  { label: "ATL", value: form.atlNow, sub: "fatigue", warn: false },
                  { label: "TSB", value: form.tsbNow, sub: "form", warn: form.tsbNow < 0 }
                ].map((m) => (
                  <div key={m.label} className="flex flex-col gap-0.5">
                    <span className="mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      {m.label} · {m.sub}
                    </span>
                    <span
                      className={`mono num text-2xl font-semibold ${m.warn ? "text-[hsl(var(--warning))]" : "text-foreground"}`}
                    >
                      {m.value.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Form / fitness curve */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-end justify-between gap-2 px-5 pt-4">
              <div>
                <CardTitle>Form / fitness curve</CardTitle>
                <CardDescription className="mt-0.5">
                  {rangeDays}-day rolling window · CTL · ATL · TSB
                </CardDescription>
              </div>
              <div className="mono flex flex-wrap gap-3.5 text-[11.5px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <i className="inline-block h-0.5 w-2.5 bg-foreground" />
                  CTL {form.ctlNow.toFixed(0)}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <i className="inline-block h-0.5 w-2.5 bg-muted-foreground" />
                  ATL {form.atlNow.toFixed(0)}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <i
                    className="inline-block w-2.5"
                    style={{ borderTop: "1px dashed hsl(var(--muted-foreground))" }}
                  />
                  TSB {form.tsbNow.toFixed(0)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-3">
              <div className="relative">
                <FormFitnessCurve ctl={form.ctl} atl={form.atl} tsb={form.tsb} h={210} />
                <div className="mono absolute right-2 top-2 rounded-md border border-border bg-popover px-2.5 py-2 text-[11.5px] leading-snug shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                  <div className="mb-1 font-semibold">
                    {chartEndDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" })} · range end
                  </div>
                  <div className="text-muted-foreground">
                    CTL <span className="text-foreground">{form.ctlNow.toFixed(0)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    ATL <span className="text-foreground">{form.atlNow.toFixed(0)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    TSB{" "}
                    <span className={form.tsbNow < 0 ? "text-[hsl(var(--warning))]" : "text-foreground"}>
                      {form.tsbNow.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Week delta */}
          <Card>
            <CardContent>
              <span className="text-xs text-muted-foreground">Week · {weekRange}</span>
              <div className="flex items-baseline gap-2.5">
                <span className="mono num text-[38px] font-semibold tracking-tight">{recentWeekLoad}</span>
                <Delta value={weekDeltaPct} />
              </div>
              <span className="text-[11.5px] text-muted-foreground">
                {priorCount > 0
                  ? `vs prior ${priorCount}-wk avg · ${Math.round(priorAvg)} TSS`
                  : `baseline · ${Math.round(priorAvg)} TSS`}
              </span>
              <WeeklyLoadChart weekly={weekly} h={110} />
            </CardContent>
          </Card>
        </div>

        {/* Zones · Signals · Ask */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1.3fr_1.4fr]">
          <Card>
            <CardHeader>
              <CardTitle>Zone distribution · {timeRange.label}</CardTitle>
              <CardDescription>Where the load went</CardDescription>
            </CardHeader>
            <CardContent>
              <ZoneStackBar zones={zoneRows} h={14} />
              <div className="mono grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {zoneRows.map((z, i) => (
                  <div key={z.key} className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <i
                        className="inline-block h-1.5 w-1.5 rounded-sm"
                        style={{ background: `hsl(var(--rs-z${i + 1}))` }}
                      />
                      {z.key}
                    </span>
                    <span className="num text-foreground">
                      {z.load} · {z.pct}%
                    </span>
                  </div>
                ))}
                {zoneRows.length === 0 ? (
                  <span className="col-span-2 text-muted-foreground">No load recorded in this window.</span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signals</CardTitle>
              <CardDescription>{dashboard.insights.length} active</CardDescription>
            </CardHeader>
            <CardContent className="gap-0 pt-2">
              {dashboard.insights.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Sync TrainerRoad or Strava to surface progression and recovery signals.
                </p>
              ) : null}
              {dashboard.insights.map((s, i) => {
                const level = s.level.toLowerCase();
                const variant: "success" | "warning" | "default" =
                  level === "positive" ? "success" : level === "caution" || level === "warning" ? "warning" : "default";
                const iconName =
                  level === "caution" || level === "warning"
                    ? "alert"
                    : level === "positive"
                      ? "trendUp"
                      : "info";
                return (
                  <article
                    key={`${s.title}-${i}`}
                    className={`flex gap-2.5 py-2.5 ${i === 0 ? "" : "border-t border-border"}`}
                  >
                    <div className="pt-0.5">
                      <Icon name={iconName} size={14} stroke={2} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium">{s.title}</span>
                        <Badge variant={variant} className="text-[10px]">
                          {s.level}
                        </Badge>
                      </div>
                      <p className="m-0 text-[12.5px] leading-snug text-muted-foreground">{s.body}</p>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Ask your data</CardTitle>
                <CardDescription>Grounded · cites every metric</CardDescription>
              </div>
              <Badge variant="outline" className="mono text-[10px]">
                ⌘K
              </Badge>
            </CardHeader>
            <CardContent>
              <Input
                icon={<Icon name="sparkles" size={14} />}
                value={question}
                onChange={(event) => onQuestionChange(event.target.value)}
                placeholder="Am I trending toward better endurance fitness?"
              />
              <Button variant="default" size="sm" onClick={onAsk} disabled={asking || !question.trim()}>
                {asking ? "Thinking…" : "Ask"}
              </Button>
              {answer ? (
                <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/40 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={answer.confidence === "high" ? "success" : answer.confidence === "medium" ? "warning" : "outline"}
                      className="text-[10px]"
                    >
                      ● {answer.confidence} confidence
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {answer.evidence.length} metrics cited
                    </span>
                  </div>
                  <p className="m-0 text-[13px] leading-snug">{answer.answer}</p>
                  {answer.evidence.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {answer.evidence.slice(0, 3).map((e) => (
                        <div
                          key={e.metric_id}
                          className="rounded-md border border-border bg-background px-2 py-1.5"
                        >
                          <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
                            {e.label}
                          </div>
                          <div className="mono num text-sm font-semibold">{e.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {answer.caveats.length > 0 ? (
                    <ul className="m-0 list-disc pl-5 text-[11.5px] text-muted-foreground">
                      {answer.caveats.map((c, i) => (
                        <li key={`${c}-${i}`}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Activities + Heatmap + FTP */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2.2fr_1fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Recent activities</CardTitle>
                <CardDescription>Top stress contributors</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10.5px]">
                  Strava {stravaCount}
                </Badge>
                <Badge variant="outline" className="text-[10.5px]">
                  TrainerRoad {trainerRoadCount}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0 pt-2">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left">
                    {["Date", "Workout", "Source", "Category", "Duration", "TSS"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground ${
                          i >= 4 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topActivities.slice(0, 6).map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="mono px-4 py-3 text-muted-foreground">{formatDate(a.started_at)}</td>
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10.5px]">
                          {a.source_priority === "strava" ? "Strava" : "TrainerRoad"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.workout_category ?? "Unclassified"}</td>
                      <td className="mono num px-4 py-3 text-right text-muted-foreground">
                        {formatDuration(a.duration_seconds)}
                      </td>
                      <td className="mono num px-4 py-3 text-right font-medium">
                        {a.tss ?? a.estimated_load ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {topActivities.length === 0 ? (
                    <tr className="border-t border-border">
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                        No activities yet — link a provider and run a sync.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Training heatmap</CardTitle>
                <CardDescription>{Math.ceil(daily.length / 7)} weeks · daily TSS</CardDescription>
              </CardHeader>
              <CardContent>
                <WeekHeatmap daily={daily} h={62} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Window load</CardTitle>
                <CardDescription>{timeRange.label} total</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2.5">
                  <span className="mono num text-[32px] font-semibold">
                    {dashboard.analysis.summary.total_recent_load}
                  </span>
                  <span className="text-sm text-muted-foreground">TSS</span>
                  <Delta value={dashboard.analysis.summary.trend_pct} />
                </div>
                <span className="mono text-xs text-muted-foreground">
                  {dashboard.analysis.meta.recent_activities} activities · avg{" "}
                  {dashboard.analysis.summary.avg_weekly_load}/wk
                </span>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

export { formatLastSync };
