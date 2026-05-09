"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { type Activity, type AthleteProfile, type DashboardResponse, type TimeRange } from "@/lib/api";
import { useAppState } from "@/components/AppState";
import {
  FormFitnessCurve,
  WeekHeatmap,
  WeeklyLoadChart,
  ZoneStackBar,
  formatDateOnly
} from "@/components/charts";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/Shell";
import { TimeRangeControl } from "@/components/TimeRangeControl";
import { buildZoneRows } from "@/lib/training";
import { METRICS } from "@/lib/metrics";
import { withTimeRange } from "@/lib/timeRange";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Delta,
  Input,
  MetricLabel,
  Skeleton,
  Tabs,
  Textarea
} from "@/components/ui";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatScoredLoad(activity: Activity) {
  const value = activity.tss ?? activity.estimated_load;
  if (value == null) return "—";
  return activity.load_source === "estimated" ? `~${Math.round(value)}` : String(Math.round(value));
}

function formatActivitySpan(activities: Activity[], totalActivities: number, timeRange: TimeRange) {
  if (activities.length === 0) {
    return `${timeRange.label} · no matching activities · ${totalActivities} imported total`;
  }
  const sorted = [...activities].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  return `${timeRange.label} · ${activities.length} visible of ${totalActivities} imported · ${formatDateLong(oldest.started_at)} to ${formatDateLong(newest.started_at)}`;
}

function useTrainingSnapshot(dashboard: DashboardResponse | null) {
  return useMemo(() => {
    if (!dashboard) return null;
    const topActivities = dashboard.analysis.top_workouts;
    const chartEndDate = new Date(`${dashboard.analysis.form.end_date}T23:59:59.999Z`);
    const form = dashboard.analysis.form;
    const verdict = dashboard.analysis.verdict;
    const loadQuality = dashboard.analysis.load_quality;
    const weekly = dashboard.analysis.weekly;
    const recentWeekLoad = Math.round(weekly[weekly.length - 1]?.load ?? dashboard.analysis.summary.latest_week_load);
    const priorCount = Math.max(0, weekly.length - 1);
    const priorAvg =
      priorCount > 0
        ? weekly.slice(0, -1).reduce((a, b) => a + b.load, 0) / priorCount
        : dashboard.analysis.summary.avg_weekly_load;
    const weekDeltaPct =
      priorAvg > 0
        ? Math.round(((recentWeekLoad - priorAvg) / priorAvg) * 100)
        : dashboard.analysis.summary.trend_pct;
    const zoneRows = buildZoneRows(dashboard.analysis.category_breakdown);
    const stravaCount = dashboard.analysis.provider_counts["strava"] ?? 0;
    const trainerRoadCount = dashboard.analysis.provider_counts["trainerroad"] ?? 0;
    const weekRange = (() => {
      const last = weekly[weekly.length - 1];
      if (!last) return "Last week";
      const [year, month, day] = last.week_start.split("-").map(Number);
      const end = new Date(Date.UTC(year, month - 1, day + 6));
      return `${formatDateOnly(last.week_start)} – ${formatDateOnly(end.toISOString().slice(0, 10))}`;
    })();

    return {
      topActivities,
      chartEndDate,
      form,
      verdict,
      loadQuality,
      weekly,
      recentWeekLoad,
      priorCount,
      priorAvg,
      weekDeltaPct,
      zoneRows,
      stravaCount,
      trainerRoadCount,
      weekRange
    };
  }, [dashboard]);
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function RangeLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground no-underline" href={href}>
      {label}
      <Icon name="trendUp" size={12} />
    </Link>
  );
}

function SummaryStat({
  label,
  value,
  detail,
  badge
}: {
  label: string;
  value: string;
  detail: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {badge}
      </div>
      <div className="mono num text-[30px] font-semibold leading-none">{value}</div>
      <span className="text-[12.5px] text-muted-foreground">{detail}</span>
    </div>
  );
}

function RouteWorkspace({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <div className={`mx-auto flex w-full max-w-[1120px] flex-col gap-4 ${className}`.trim()}>{children}</div>
    </div>
  );
}

function RouteMessage() {
  const { message, clearMessage } = useAppState();

  if (!message) return null;
  return (
    <Alert title="Update" icon={<Icon name="info" size={15} />}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        <Button variant="ghost" size="sm" onClick={clearMessage}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}

function GlobalMessage() {
  const { message, clearMessage } = useAppState();

  if (!message) return null;
  return (
    <Alert
      title="Update"
      icon={<Icon name="info" size={15} />}
      className="mx-4 mt-4 sm:mx-6 lg:mx-8"
    >
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <Button variant="ghost" size="sm" onClick={clearMessage}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}

export function OverviewRoute() {
  const { dashboard, timeRange, setTimeRange, question, setQuestion, ask, asking, answer, syncing, syncAll } =
    useAppState();
  const snapshot = useTrainingSnapshot(dashboard);

  if (!dashboard || !snapshot) return <PageSkeleton />;
  const overviewActivities = snapshot.topActivities.slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Training overview"
        subtitle="A summary-first read of your current training state."
        right={
          <>
            <TimeRangeControl range={timeRange} onChange={setTimeRange} />
            <Button variant="default" size="sm" onClick={syncAll} disabled={syncing}>
              <Icon name="zap" size={13} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </>
        }
      />
      <RouteWorkspace>
        <RouteMessage />

        <Card className="shadow-none">
          <CardContent className="gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Training state</div>
                <div className="mt-1 text-[14px] text-muted-foreground">
                  Start here for the clearest read on readiness, workload, and what deserves deeper inspection next.
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:w-[360px]">
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Week load</div>
                  <div className="mono num mt-1 text-lg font-semibold">{snapshot.recentWeekLoad}</div>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Signals</div>
                  <div className="mono num mt-1 text-lg font-semibold">{dashboard.insights.length}</div>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Visible rides</div>
                  <div className="mono num mt-1 text-lg font-semibold">{dashboard.analysis.meta.recent_activities}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.65fr)_320px]">
          <Card className="overflow-hidden">
            <CardContent className="gap-4 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge variant="success">● {snapshot.verdict.label}</Badge>
                    <span className="text-xs text-muted-foreground">{snapshot.verdict.qualifier}</span>
                  </div>
                  <h2 className="m-0 text-[clamp(30px,4.4vw,46px)] font-semibold leading-[0.96] tracking-tight">
                    {snapshot.verdict.headline}
                  </h2>
                  <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                    {snapshot.verdict.detail}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <RangeLink href={withTimeRange("/training", timeRange)} label="Open training analysis" />
                  <RangeLink href={withTimeRange("/activities", timeRange)} label="Browse activities" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <SummaryStat label="Fitness (CTL)" value={snapshot.form.ctl_now.toFixed(0)} detail="Long-term workload" />
                <SummaryStat label="Fatigue (ATL)" value={snapshot.form.atl_now.toFixed(0)} detail="Recent short-term strain" />
                <SummaryStat label="Readiness (TSB)" value={snapshot.form.tsb_now.toFixed(0)} detail="Projected next-day form" />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Badge
                  variant={
                    snapshot.loadQuality.confidence === "high"
                      ? "success"
                      : snapshot.loadQuality.confidence === "medium"
                        ? "warning"
                        : "outline"
                  }
                  className="text-[10px]"
                >
                  ● {snapshot.loadQuality.confidence} confidence
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Proxy load {snapshot.loadQuality.proxy_share_pct.toFixed(0)}%
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  History {snapshot.loadQuality.history_days} days
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 xl:grid-cols-[minmax(0,1.2fr)_280px] xl:items-start">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Fitness trend</div>
                      <div className="mt-1 text-[13px] text-muted-foreground">
                        This compact view shows the momentum behind the current verdict.
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {timeRange.label}
                    </Badge>
                  </div>
                  <FormFitnessCurve
                    ctl={snapshot.form.ctl}
                    atl={snapshot.form.atl}
                    tsb={snapshot.form.tsb}
                    endDate={snapshot.chartEndDate}
                    h={136}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-md border border-border px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Why this verdict</div>
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      {snapshot.verdict.reasoning}
                    </div>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Inspect next</div>
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      {snapshot.verdict.next_step}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Current week</CardTitle>
                <CardDescription>{snapshot.weekRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2.5">
                  <span className="mono num text-[38px] font-semibold">{snapshot.recentWeekLoad}</span>
                  <Delta value={snapshot.weekDeltaPct} />
                </div>
                <span className="text-[12.5px] text-muted-foreground">
                  {snapshot.priorCount > 0
                    ? `vs prior ${snapshot.priorCount}-week average of ${Math.round(snapshot.priorAvg)} TSS`
                    : `Average baseline ${Math.round(snapshot.priorAvg)} TSS`}
                </span>
                <div className="mt-4">
                  <WeeklyLoadChart weekly={snapshot.weekly} h={122} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Signals</CardTitle>
                <CardDescription>{dashboard.insights.length} active observations</CardDescription>
              </div>
              <RangeLink href={withTimeRange("/training", timeRange)} label="Interpret in Training" />
            </CardHeader>
            <CardContent className="gap-0 pt-1">
              {dashboard.insights.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Sync TrainerRoad or Strava to surface progression and recovery signals.
                </p>
              ) : null}
              {dashboard.insights.slice(0, 3).map((signal, index) => {
                const level = signal.level.toLowerCase();
                const variant: "success" | "warning" | "default" =
                  level === "positive" ? "success" : level === "caution" || level === "warning" ? "warning" : "default";
                return (
                  <article key={`${signal.title}-${index}`} className={`flex gap-2.5 py-2.5 ${index === 0 ? "" : "border-t border-border"}`}>
                    <div className="pt-0.5">
                      <Icon name={level === "positive" ? "trendUp" : level === "warning" || level === "caution" ? "alert" : "info"} size={14} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium">{signal.title}</span>
                        <Badge variant={variant} className="text-[10px]">
                          {signal.level}
                        </Badge>
                      </div>
                      <p className="m-0 text-[12.5px] leading-snug text-muted-foreground">{signal.body}</p>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ask preview</CardTitle>
              <CardDescription>Use a quick question here, then continue in the full Ask workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                icon={<Icon name="sparkles" size={14} />}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Am I trending toward better endurance fitness?"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="default" size="sm" onClick={ask} disabled={asking || !question.trim()}>
                  {asking ? "Thinking…" : "Ask"}
                </Button>
                <RangeLink href={withTimeRange("/ask", timeRange)} label="Open full Ask workspace" />
              </div>
              {answer ? (
                <div className="rounded-[var(--radius)] border border-border bg-muted/40 px-3.5 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge
                      variant={answer.confidence === "high" ? "success" : answer.confidence === "medium" ? "warning" : "outline"}
                      className="text-[10px]"
                    >
                      ● {answer.confidence} confidence
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{answer.evidence.length} metrics cited</span>
                  </div>
                  <p className="m-0 text-[13px] leading-relaxed">{answer.answer}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Recent activity highlights</CardTitle>
              <CardDescription>{timeRange.label} · top stress contributors in this window</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Strava {snapshot.stravaCount}</Badge>
              <Badge variant="outline">TrainerRoad {snapshot.trainerRoadCount}</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left">
                    {["Date", "Workout", "Source", "Category", "Load"].map((heading, index) => (
                      <th
                        key={heading}
                        className={`px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground ${index === 4 ? "text-right" : ""}`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overviewActivities.map((activity) => (
                    <tr key={activity.id} className="border-t border-border hover:bg-accent/20">
                      <td className="mono px-4 py-3 text-muted-foreground">{formatDate(activity.started_at)}</td>
                      <td className="px-4 py-3 font-medium">{activity.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10.5px]">
                          {activity.source_priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{activity.workout_category ?? "Unclassified"}</td>
                      <td className="mono num px-4 py-3 text-right font-medium">{formatScoredLoad(activity)}</td>
                    </tr>
                  ))}
                  {overviewActivities.length === 0 ? (
                    <tr className="border-t border-border">
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                        No activities in this range yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </RouteWorkspace>
    </>
  );
}

export function TrainingRoute() {
  const { dashboard, timeRange, setTimeRange } = useAppState();
  const [section, setSection] = useState("fitness");
  const snapshot = useTrainingSnapshot(dashboard);

  if (!dashboard || !snapshot) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        eyebrow="Training"
        title="Training analysis"
        subtitle="Deeper metrics, grouped so you can scan one layer at a time."
        right={<TimeRangeControl range={timeRange} onChange={setTimeRange} />}
      />
      <RouteWorkspace>
        <RouteMessage />
        <Card className="shadow-none">
          <CardContent className="gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Analysis workspace</div>
                <div className="mt-1 text-[14px] text-muted-foreground">
                  Use one lens at a time: fitness progression, intensity distribution, or consistency across the block.
                </div>
              </div>
              <span className="text-[12.5px] text-muted-foreground">{timeRange.label}</span>
            </div>
            <Tabs
              ariaLabel="Training sections"
              className="w-full overflow-x-auto"
              value={section}
              onChange={setSection}
              options={[
                { value: "fitness", label: "Fitness" },
                { value: "intensity", label: "Intensity" },
                { value: "consistency", label: "Consistency" }
              ]}
            />
          </CardContent>
        </Card>

        {section === "fitness" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.8fr)_320px]">
            <Card>
              <CardHeader className="flex-row flex-wrap items-end justify-between gap-2">
                <div>
                  <CardTitle>Fitness / fatigue / readiness</CardTitle>
                  <CardDescription>
                    Visible window: {timeRange.label.toLowerCase()} · model history: {snapshot.loadQuality.history_days} days
                  </CardDescription>
                </div>
                <div className="mono flex flex-wrap gap-3.5 text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <i className="inline-block h-0.5 w-2.5 bg-foreground" />
                    <MetricLabel metric={METRICS.ctl} label="Fitness" /> {snapshot.form.ctl_now.toFixed(0)}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <i className="inline-block h-0.5 w-2.5 bg-muted-foreground" />
                    <MetricLabel metric={METRICS.atl} label="Fatigue" /> {snapshot.form.atl_now.toFixed(0)}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <i className="inline-block w-2.5" style={{ borderTop: "1px dashed hsl(var(--muted-foreground))" }} />
                    <MetricLabel metric={METRICS.tsb} label="Readiness" /> {snapshot.form.tsb_now.toFixed(0)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-3">
                <FormFitnessCurve
                  ctl={snapshot.form.ctl}
                  atl={snapshot.form.atl}
                  tsb={snapshot.form.tsb}
                  endDate={snapshot.chartEndDate}
                  h={260}
                />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Current read</CardTitle>
                  <CardDescription>{snapshot.verdict.qualifier}</CardDescription>
                </CardHeader>
                <CardContent>
                  <h3 className="m-0 text-xl font-semibold">{snapshot.verdict.headline}</h3>
                  <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{snapshot.verdict.detail}</p>
                  <p className="m-0 text-[12.5px] leading-relaxed text-muted-foreground">{snapshot.loadQuality.note}</p>
                  <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
                    <SummaryStat label="Fitness" value={snapshot.form.ctl_now.toFixed(0)} detail="CTL" />
                    <SummaryStat label="Fatigue" value={snapshot.form.atl_now.toFixed(0)} detail="ATL" />
                    <SummaryStat label="Readiness" value={snapshot.form.tsb_now.toFixed(0)} detail="TSB" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Weekly load</CardTitle>
                  <CardDescription>{snapshot.weekRange}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2.5">
                    <span className="mono num text-[38px] font-semibold">{snapshot.recentWeekLoad}</span>
                    <Delta value={snapshot.weekDeltaPct} />
                  </div>
                  <WeeklyLoadChart weekly={snapshot.weekly} h={132} />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {section === "intensity" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Workout mix</CardTitle>
                <CardDescription>Where the scored load went by workout category in {timeRange.label.toLowerCase()}.</CardDescription>
              </CardHeader>
              <CardContent>
                <ZoneStackBar zones={snapshot.zoneRows} h={16} />
                <div className="mono mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  {snapshot.zoneRows.map((zone, index) => (
                    <div key={zone.key} className="flex justify-between rounded-md border border-border px-3 py-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <i
                          className="inline-block h-1.5 w-1.5 rounded-sm"
                          style={{ background: `hsl(var(--rs-z${index + 1}))` }}
                        />
                        {zone.key}
                      </span>
                      <span className="num text-foreground">
                        {zone.load} · {zone.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Window totals</CardTitle>
                <CardDescription>Quick read of volume and stress.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border px-3 py-2.5">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total load</div>
                    <div className="mono num mt-1 text-[28px] font-semibold">
                      {dashboard.analysis.summary.total_recent_load}
                    </div>
                    <div className="text-[12px] text-muted-foreground">Scored load across visible activities</div>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2.5">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Average weekly load</div>
                    <div className="mono num mt-1 text-[28px] font-semibold">
                      {dashboard.analysis.summary.avg_weekly_load}
                    </div>
                    <div className="text-[12px] text-muted-foreground">TSS per week</div>
                  </div>
                </div>
                <div className="mt-4">
                  <Alert icon={<Icon name="info" size={14} />} title="How to read this section">
                    Use this view when you want to see whether your work is concentrated in a few zones or spread in a way
                    that matches your intent for the block.
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {section === "consistency" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
            <Card>
              <CardHeader>
                <CardTitle>Training heatmap</CardTitle>
                <CardDescription>{Math.ceil(snapshot.form.daily_load.length / 7)} weeks of daily scored load</CardDescription>
              </CardHeader>
              <CardContent>
                <WeekHeatmap daily={snapshot.form.daily_load} endDate={snapshot.chartEndDate} h={92} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Consistency notes</CardTitle>
                <CardDescription>Use the heatmap to spot rhythm and gaps.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="m-0 list-disc pl-5 text-[13px] leading-relaxed text-muted-foreground">
                  <li>{dashboard.analysis.meta.recent_activities} visible activities in the selected range.</li>
                  <li>{snapshot.weekly.length} weekly buckets are contributing to the trend line.</li>
                  <li>Look for clusters, gaps, and abrupt load spikes before drawing conclusions from a single number.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </RouteWorkspace>
    </>
  );
}

export function ActivitiesRoute() {
  const { dashboard, activities, totalActivities, timeRange, setTimeRange } = useAppState();
  const [source, setSource] = useState("all");
  const [category, setCategory] = useState("all");

  const categories = useMemo(
    () =>
      Array.from(new Set(activities.map((activity) => activity.workout_category).filter((value): value is string => Boolean(value)))).sort(),
    [activities]
  );

  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const sourceMatch = source === "all" || activity.source_priority === source;
        const categoryMatch =
          category === "all" || (category === "unclassified" ? !activity.workout_category : activity.workout_category === category);
        return sourceMatch && categoryMatch;
      }),
    [activities, source, category]
  );

  if (!dashboard) return <PageSkeleton />;
  const providerCounts = dashboard.analysis.provider_counts;

  const exportActivities = () => {
    const headers = ["Date", "Workout", "Sport", "Source", "Category", "Duration seconds", "Load source", "TSS", "Estimated load"];
    const safeCsvCell = (cell: string) => {
      const safeValue = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };
    const rows = filteredActivities.map((activity) => [
      activity.started_at,
      activity.name,
      activity.sport_type,
      activity.source_priority,
      activity.workout_category ?? "",
      String(activity.duration_seconds),
      activity.load_source,
      activity.tss == null ? "" : String(activity.tss),
      activity.estimated_load == null ? "" : String(activity.estimated_load)
    ]);
    const csv = [headers, ...rows].map((row) => row.map(safeCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ridesense-activities.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Activities"
        title="Merged activity feed"
        subtitle={formatActivitySpan(filteredActivities, totalActivities, timeRange)}
        right={
          <>
            <TimeRangeControl range={timeRange} onChange={setTimeRange} />
            <Button variant="outline" size="sm" onClick={exportActivities} disabled={filteredActivities.length === 0}>
              <Icon name="download" size={13} />
              Export filtered
            </Button>
          </>
        }
      />
      <RouteWorkspace>
        <RouteMessage />
        <Card className="shadow-none">
          <CardContent className="gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Browse the merged timeline</div>
                <div className="mt-1 text-[14px] text-muted-foreground">
                  Filter the canonical feed, export what is visible, and scan contributions from each source without leaving this page.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Visible {filteredActivities.length}</Badge>
                <Badge variant="outline">Strava {providerCounts.strava ?? 0}</Badge>
                <Badge variant="outline">TrainerRoad {providerCounts.trainerroad ?? 0}</Badge>
                <Badge variant="outline">Upload {providerCounts.upload ?? 0}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="activity-source">
                  Source
                </label>
                <select
                  id="activity-source"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="all">All sources</option>
                  <option value="strava">Strava</option>
                  <option value="trainerroad">TrainerRoad</option>
                  <option value="upload">Upload</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="activity-category">
                  Category
                </label>
                <select
                  id="activity-category"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="all">All categories</option>
                  <option value="unclassified">Unclassified</option>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={exportActivities} disabled={filteredActivities.length === 0} className="w-full lg:w-auto">
                  <Icon name="download" size={13} />
                  Export filtered
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Activity list</CardTitle>
              <CardDescription>{formatActivitySpan(filteredActivities, totalActivities, timeRange)}</CardDescription>
            </div>
            <RangeLink href={withTimeRange("/training", timeRange)} label="Interpret this range in Training" />
          </CardHeader>
          <CardContent className="px-0 pt-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left">
                    {["Date", "Workout", "Sport", "Source", "Category", "Duration", "Load"].map((heading, index) => (
                      <th
                        key={heading}
                        className={`px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground ${
                          index >= 5 ? "text-right" : ""
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((activity) => (
                    <tr key={activity.id} className="border-t border-border hover:bg-accent/20">
                      <td className="mono px-4 py-3 text-muted-foreground">{formatDateLong(activity.started_at)}</td>
                      <td className="px-4 py-3 font-medium">{activity.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{activity.sport_type}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10.5px]">
                          {activity.source_priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{activity.workout_category ?? "Unclassified"}</td>
                      <td className="mono num px-4 py-3 text-right text-muted-foreground">
                        {formatDuration(activity.duration_seconds)}
                      </td>
                      <td className="mono num px-4 py-3 text-right font-medium">{formatScoredLoad(activity)}</td>
                    </tr>
                  ))}
                  {filteredActivities.length === 0 ? (
                    <tr className="border-t border-border">
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                        No activities match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </RouteWorkspace>
    </>
  );
}

export function AskRoute() {
  const { question, setQuestion, ask, asking, answer, timeRange, setTimeRange } = useAppState();

  const suggestions = [
    "Am I building fitness at a sustainable rate?",
    "Where is most of my load concentrated right now?",
    "Do my recent weeks suggest I need more recovery?",
    "What changed most between the start and end of this range?"
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ask"
        title="Grounded answers"
        subtitle={`Answers cite the metrics they used from ${timeRange.label.toLowerCase()}.`}
        right={<TimeRangeControl range={timeRange} onChange={setTimeRange} />}
      />
      <RouteWorkspace>
        <RouteMessage />
        <Card className="shadow-none">
          <CardContent className="gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Question workspace</div>
                <div className="mt-1 text-[14px] text-muted-foreground">
                  Ask one grounded question at a time, review the answer, then inspect the evidence and caveats beneath it.
                </div>
              </div>
              <RangeLink href={withTimeRange("/", timeRange)} label="Return to Overview" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_320px]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Question</CardTitle>
                <CardDescription>Ask in plain language. The answer stays grounded in your metrics.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Am I trending toward better endurance fitness?"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[12.5px] text-muted-foreground">Answers use {timeRange.label.toLowerCase()}.</span>
                  <Button variant="default" size="sm" onClick={ask} disabled={asking || !question.trim()}>
                    <Icon name="sparkles" size={13} />
                    {asking ? "Thinking…" : "Ask"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Answer</CardTitle>
                  <CardDescription>{answer ? `${answer.evidence.length} metrics cited` : "Run a question to populate this workspace."}</CardDescription>
                </div>
                {answer ? (
                  <Badge
                    variant={answer.confidence === "high" ? "success" : answer.confidence === "medium" ? "warning" : "outline"}
                  >
                    ● {answer.confidence}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent>
                {answer ? (
                  <>
                    <p className="m-0 text-[15px] leading-relaxed">{answer.answer}</p>
                    {answer.evidence.length > 0 ? (
                      <div>
                        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Evidence</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {answer.evidence.map((evidence) => (
                            <div key={evidence.metric_id} className="rounded-md border border-border bg-background px-3 py-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{evidence.label}</div>
                              <div className="mono num text-[15px] font-semibold">{evidence.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {answer.caveats.length > 0 ? (
                      <div>
                        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Caveats</div>
                        <ul className="m-0 list-disc pl-5 text-[12.5px] text-muted-foreground">
                          {answer.caveats.map((caveat) => (
                            <li key={caveat}>{caveat}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-[13px] text-muted-foreground">
                    Ask a question to generate a grounded answer with supporting evidence.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Suggested prompts</CardTitle>
                <CardDescription>Use one as-is or as a starting point.</CardDescription>
              </CardHeader>
              <CardContent>
                {suggestions.map((suggestion) => (
                  <Button key={suggestion} variant="outline" size="sm" className="justify-start whitespace-normal text-left h-auto py-2" onClick={() => setQuestion(suggestion)}>
                    {suggestion}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {answer?.follow_up_questions.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Follow-up questions</CardTitle>
                  <CardDescription>Continue from the same answer.</CardDescription>
                </CardHeader>
                <CardContent>
                  {answer.follow_up_questions.map((followUp) => (
                    <Button key={followUp} variant="ghost" size="sm" className="justify-start whitespace-normal text-left h-auto py-2" onClick={() => setQuestion(followUp)}>
                      {followUp}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </RouteWorkspace>
    </>
  );
}

export function ConnectionsRoute() {
  const {
    dashboard,
    configStatus,
    linkStrava,
    linkTrainerRoad,
    syncAll,
    uploadFile,
    syncing,
    uploading,
    message,
    clearMessage
  } = useAppState();
  const [section, setSection] = useState("providers");

  if (!dashboard) return <PageSkeleton />;

  const stravaConnection = dashboard.connections.find((c) => c.provider === "strava");
  const trConnection = dashboard.connections.find((c) => c.provider === "trainerroad");
  const successfulSyncStatuses = new Set(["ok", "succeeded", "completed"]);
  const trainerRoadScaffoldMessage = "TrainerRoad browser session linking is scaffolded. Implement Playwright login/session capture before production use.";
  const trainerRoadNotice = message.includes("TrainerRoad browser session linking is scaffolded") ? message : "";
  const scopedMessage = trainerRoadNotice ? "" : message;
  const connectedCount = dashboard.connections.filter((c) => c.status === "connected" || c.status === "active").length;

  const cards = [
    {
      key: "strava",
      name: "Strava",
      description: "OAuth · activity feed, GPS, HR, power.",
      connection: stravaConnection,
      action: linkStrava,
      cta:
        configStatus && !configStatus.strava_configured
          ? "Strava not configured"
          : stravaConnection
            ? "Relink Strava"
            : "Link Strava",
      disabled: Boolean(configStatus && !configStatus.strava_configured)
    },
    {
      key: "trainerroad",
      name: "TrainerRoad",
      description: "Browser-session linking · workouts, planned TSS, ramp tests.",
      connection: trConnection,
      action: linkTrainerRoad,
      cta:
        configStatus?.trainerroad_linking_configured
          ? trConnection
            ? "Relink TrainerRoad"
            : "Link TrainerRoad"
          : "TrainerRoad scaffolded",
      disabled: false
    }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Sources and sync"
        subtitle="Link providers, import files, and audit sync history."
        right={
          <Button variant="default" size="sm" onClick={syncAll} disabled={syncing}>
            <Icon name="zap" size={13} />
            {syncing ? "Syncing…" : "Sync all"}
          </Button>
        }
      />
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
          {scopedMessage ? (
            <Alert title="Update" icon={<Icon name="info" size={15} />}>
              <div className="flex items-center justify-between gap-3">
                <span>{scopedMessage}</span>
                <Button variant="ghost" size="sm" onClick={clearMessage}>
                  Dismiss
                </Button>
              </div>
            </Alert>
          ) : null}

          <Card className="shadow-none">
            <CardContent className="gap-4 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Workspace</div>
                  <div className="mt-1 text-[14px] text-muted-foreground">
                    Manage provider access, upload files, and review sync activity without leaving this page.
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:w-[340px]">
                  <div className="rounded-md border border-border px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Connected</div>
                    <div className="mono num mt-1 text-lg font-semibold">{connectedCount}</div>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Uploads</div>
                    <div className="mono num mt-1 text-lg font-semibold">{dashboard.analysis.provider_counts.upload ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sync runs</div>
                    <div className="mono num mt-1 text-lg font-semibold">{dashboard.sync_runs.length}</div>
                  </div>
                </div>
              </div>

              <Tabs
                ariaLabel="Connections sections"
                value={section}
                onChange={setSection}
                options={[
                  { value: "providers", label: "Providers" },
                  { value: "upload", label: "Upload" },
                  { value: "history", label: "Sync history" }
                ]}
              />
            </CardContent>
          </Card>

          {section === "providers" ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {cards.map((card) => {
                const status = card.connection?.status ?? "not connected";
                const variant: "success" | "warning" | "outline" =
                  status === "connected" || status === "active"
                    ? "success"
                    : status === "stale" || status === "error"
                      ? "warning"
                      : "outline";
                const isTrainerRoad = card.key === "trainerroad";
                return (
                  <Card key={card.key}>
                    <CardHeader className="pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>{card.name}</CardTitle>
                          <CardDescription className="mt-1">{card.description}</CardDescription>
                        </div>
                        <Badge variant={variant}>● {status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md border border-border px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">State</div>
                          <div className="mt-1 text-[13px] font-medium text-foreground">
                            {card.connection ? "Linked and available" : "Awaiting link"}
                          </div>
                        </div>
                        <div className="rounded-md border border-border px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Freshness</div>
                          <div className="mono mt-1 text-[12px] text-muted-foreground">
                            {card.connection ? new Date(card.connection.updated_at).toLocaleString() : "No recent update"}
                          </div>
                        </div>
                      </div>

                      {isTrainerRoad ? (
                        <Alert
                          variant="warning"
                          icon={<Icon name="info" size={14} />}
                          title="TrainerRoad setup is scaffolded"
                        >
                          {trainerRoadNotice || trainerRoadScaffoldMessage}
                        </Alert>
                      ) : null}

                      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5">
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Primary action</div>
                          <div className="text-[13px] text-muted-foreground">
                            {card.connection ? "Refresh or replace this connection." : "Connect this provider to pull data."}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={card.action} disabled={card.disabled}>
                          <Icon name="plug" size={13} />
                          {card.cta}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}

          {section === "upload" ? (
            <Card>
              <CardHeader>
                <CardTitle>Upload activity file</CardTitle>
                <CardDescription>
                  Add a `.gpx`, `.tcx`, or `.fit` file when you want to backfill or import a workout outside the linked
                  providers.
                </CardDescription>
              </CardHeader>
              <CardContent className="gap-4">
                <label
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-9 text-[12.5px] text-muted-foreground transition hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (uploading) return;
                    const file = event.dataTransfer.files[0];
                    if (file) uploadFile(file);
                  }}
                >
                  <Icon name="download" size={18} />
                  <span>{uploading ? "Uploading…" : "Click to choose or drop a .gpx / .tcx / .fit file"}</span>
                  <input
                    type="file"
                    accept=".gpx,.tcx,.fit"
                    className="sr-only"
                    aria-label="Upload activity file"
                    disabled={uploading}
                    onChange={(event) => {
                      if (uploading) {
                        event.target.value = "";
                        return;
                      }
                      const file = event.target.files?.[0];
                      if (file) uploadFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 text-[12.5px] text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-md border border-border px-3 py-2.5">Accepted formats: GPX, TCX, FIT.</div>
                  <div className="rounded-md border border-border px-3 py-2.5">Imports are deduplicated against existing rides.</div>
                  <div className="rounded-md border border-border px-3 py-2.5">Uploaded workouts flow into the same timeline and analysis.</div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {section === "history" ? (
            <Card>
              <CardHeader>
                <CardTitle>Sync history</CardTitle>
                <CardDescription>Most recent {dashboard.sync_runs.length} runs</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left">
                        {["Run", "Provider", "Status", "Message"].map((heading) => (
                          <th
                            key={heading}
                            className="px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.sync_runs.map((run) => (
                        <tr key={run.id} className="border-t border-border">
                          <td className="mono px-4 py-3 text-muted-foreground">#{run.id}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-[10.5px]">
                              {run.provider}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={successfulSyncStatuses.has(run.status) ? "success" : "warning"}
                              className="text-[10.5px]"
                            >
                              {run.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{run.message}</td>
                        </tr>
                      ))}
                      {dashboard.sync_runs.length === 0 ? (
                        <tr className="border-t border-border">
                          <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                            No syncs yet. Run a sync after linking a provider to start building history.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function AthleteContextRoute() {
  const { profile, setProfile, saveProfile, savingProfile, session, signOut } = useAppState();

  const fields: Array<{ key: keyof AthleteProfile; label: string; rows: number }> = [
    { key: "event_type", label: "Event type", rows: 2 },
    { key: "goals", label: "Goals", rows: 3 },
    { key: "constraints", label: "Constraints", rows: 2 },
    { key: "recovery_notes", label: "Recovery notes", rows: 2 },
    { key: "training_days", label: "Training days", rows: 2 }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Athlete Context"
        title="Athlete context"
        subtitle="Saved notes that ground answers and explain what the numbers are in service of."
        right={
          session ? (
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          ) : null
        }
      />
      <RouteWorkspace>
        <RouteMessage />
        <Card className="shadow-none">
          <CardContent className="gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Athlete notes</div>
                <div className="mt-1 text-[14px] text-muted-foreground">
                  Keep goals, constraints, and training context current so grounded answers reflect what the numbers are in service of.
                </div>
              </div>
              <Button variant="default" size="sm" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save context"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
              <CardDescription>Account-level context.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</span>
                <span className="mono text-[13px]">{session?.user.email ?? "Demo mode"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Training context</CardTitle>
              <CardDescription>Keep this current so Ask answers have the right goals and constraints.</CardDescription>
            </CardHeader>
            <CardContent>
              {fields.map((field) => (
                <div className="flex flex-col gap-1.5" key={field.key}>
                  <label htmlFor={field.key} className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {field.label}
                  </label>
                  <Textarea
                    id={field.key}
                    rows={field.rows}
                    value={profile[field.key]}
                    onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })}
                  />
                </div>
              ))}
              <div className="sm:hidden">
                <Button variant="default" size="sm" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save context"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </RouteWorkspace>
    </>
  );
}
