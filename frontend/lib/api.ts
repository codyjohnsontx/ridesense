export type SyncRun = { id: number; provider: string; status: string; message: string };

export type DashboardResponse = {
  analysis: {
    meta: {
      total_activities: number;
      recent_activities: number;
      weeks: number | null;
      range: {
        mode: "preset" | "custom" | "all";
        label: string;
        start_date: string | null;
        end_date: string | null;
      };
    };
    summary: {
      latest_week_load: number;
      avg_weekly_load: number;
      trend_pct: number;
      total_recent_load: number;
    };
    form: {
      daily_load: number[];
      ctl: number[];
      atl: number[];
      tsb: number[];
      ctl_now: number;
      atl_now: number;
      tsb_now: number;
      ctl_change_pct_4w: number;
      ramp_rate_per_week: number;
      start_date: string;
      end_date: string;
    };
    verdict: {
      label: "Building" | "Maintaining" | "Detraining" | "Recovering";
      qualifier: string;
      headline: string;
      detail: string;
      reasoning: string;
      next_step: string;
    };
    load_quality: {
      confidence: "low" | "medium" | "high";
      history_days: number;
      proxy_share_pct: number;
      tss_activity_count: number;
      estimated_activity_count: number;
      unscored_activity_count: number;
      enough_history: boolean;
      note: string;
    };
    weekly: Array<{ week_start: string; load: number; count: number; duration_hours: number }>;
    category_breakdown: Record<string, { count: number; load: number }>;
    provider_counts: Record<string, number>;
    top_workouts: Array<Activity>;
  };
  insights: Array<{ level: string; title: string; body: string }>;
  connections: Array<{ provider: string; status: string; updated_at: string }>;
  sync_runs: SyncRun[];
};

export type Activity = {
  id: number;
  name: string;
  sport_type: string;
  started_at: string;
  duration_seconds: number;
  tss: number | null;
  estimated_load: number | null;
  load_source: "tss" | "estimated" | "none";
  workout_category: string | null;
  source_priority: string;
  external_url?: string | null;
};

export type AthleteProfile = {
  event_type: string;
  goals: string;
  constraints: string;
  recovery_notes: string;
  training_days: string;
};

export type GroundedAnswer = {
  answer: string;
  evidence: Array<{ metric_id: string; label: string; value: string }>;
  confidence: "low" | "medium" | "high";
  caveats: string[];
  follow_up_questions: string[];
};

export type ActivitiesResponse = {
  activities: Activity[];
  total_activities?: number;
};

export type ConfigStatus = {
  strava_configured: boolean;
  trainerroad_linking_configured: boolean;
  openai_configured: boolean;
  dev_auth_enabled: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACTIVITY_PAGE_SIZE = 1000;

export type PresetRange = "1m" | "12w" | "6mo" | "1y" | "2y";

export type TimeRange =
  | { mode: "preset"; preset: PresetRange; weeks: number; label: string; days: number }
  | { mode: "all"; label: string; days: number }
  | { mode: "custom"; startDate: string; endDate: string; label: string; days: number };

export const PRESET_RANGES: Record<PresetRange, TimeRange> = {
  "1m": { mode: "preset", preset: "1m", weeks: 4, label: "Last month", days: 28 },
  "12w": { mode: "preset", preset: "12w", weeks: 12, label: "Last 12 weeks", days: 84 },
  "6mo": { mode: "preset", preset: "6mo", weeks: 26, label: "Last 6 months", days: 182 },
  "1y": { mode: "preset", preset: "1y", weeks: 52, label: "Last year", days: 364 },
  "2y": { mode: "preset", preset: "2y", weeks: 104, label: "Last 2 years", days: 728 }
};

export const DEFAULT_TIME_RANGE = PRESET_RANGES["12w"];
export const ALL_TIME_RANGE: TimeRange = { mode: "all", label: "All time", days: 84 };

export function customTimeRange(startDate: string, endDate: string): TimeRange {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const ms = Math.max(0, end.getTime() - start.getTime());
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  return {
    mode: "custom",
    startDate,
    endDate,
    label: `${startDate} to ${endDate}`,
    days
  };
}

function rangeQuery(range: TimeRange): string {
  const params = new URLSearchParams();
  if (range.mode === "all") {
    params.set("all_time", "true");
  } else if (range.mode === "custom") {
    params.set("start_date", range.startDate);
    params.set("end_date", range.endDate);
  } else {
    params.set("weeks", String(range.weeks));
  }
  return params.toString();
}

function authHeaders(token?: string): Record<string, string> {
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return { "X-User-Id": "demo-user" };
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: (range: TimeRange, token?: string) =>
    request<DashboardResponse>(`/dashboard?${rangeQuery(range)}`, undefined, token),
  activitiesPage: (range: TimeRange, limit: number = ACTIVITY_PAGE_SIZE, offset: number = 0, token?: string) =>
    request<ActivitiesResponse>(`/activities?${rangeQuery(range)}&limit=${limit}&offset=${offset}`, undefined, token),
  activities: async (range: TimeRange, token?: string) => {
    const all: Activity[] = [];
    let offset = 0;
    let totalActivities: number | undefined;
    while (true) {
      const page = await api.activitiesPage(range, ACTIVITY_PAGE_SIZE, offset, token);
      totalActivities = page.total_activities ?? totalActivities;
      all.push(...page.activities);
      if (page.activities.length < ACTIVITY_PAGE_SIZE) {
        return { activities: all, total_activities: totalActivities };
      }
      offset += ACTIVITY_PAGE_SIZE;
    }
  },
  configStatus: (token?: string) => request<ConfigStatus>("/config/status", undefined, token),
  profile: (token?: string) => request<AthleteProfile>("/athlete-profile", undefined, token),
  saveProfile: (profile: AthleteProfile, token?: string) =>
    request<AthleteProfile>(
      "/athlete-profile",
      {
        method: "PUT",
        body: JSON.stringify(profile)
      },
      token
    ),
  ask: (question: string, range: TimeRange, token?: string) =>
    request<GroundedAnswer>(
      `/questions?${rangeQuery(range)}`,
      {
        method: "POST",
        body: JSON.stringify({ question })
      },
      token
    ),
  startSync: (provider: "all" | "strava" | "trainerroad", token?: string) =>
    request<{ id: number; status: string; message: string }>(
      "/sync-runs",
      {
        method: "POST",
        body: JSON.stringify({ provider })
      },
      token
    ),
  startStravaLink: (token?: string) =>
    request<{ authorization_url: string }>(
      "/strava/link/start",
      {
        method: "POST"
      },
      token
    ),
  startTrainerRoadLink: (token?: string) =>
    request<{ status: string; message: string }>(
      "/trainerroad/link/start",
      {
        method: "POST"
      },
      token
    ),
  uploadActivity: async (file: File, token?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/uploads/activity`, {
      method: "POST",
      headers: authHeaders(token),
      body: formData,
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json() as Promise<{
      status: string;
      name: string;
      started_at: string;
      duration_seconds: number;
      distance_meters: number | null;
    }>;
  }
};
