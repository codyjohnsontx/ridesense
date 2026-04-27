export type SyncRun = { id: number; provider: string; status: string; message: string };

export type DashboardResponse = {
  analysis: {
    meta: { total_activities: number; recent_activities: number; weeks: number };
    summary: {
      latest_week_load: number;
      avg_weekly_load: number;
      trend_pct: number;
      total_recent_load: number;
    };
    weekly: Array<{ week_start: string; load: number; count: number; duration_hours: number }>;
    zone_breakdown: Record<string, { count: number; load: number }>;
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
};

export type ConfigStatus = {
  strava_configured: boolean;
  trainerroad_linking_configured: boolean;
  openai_configured: boolean;
  dev_auth_enabled: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACTIVITY_PAGE_SIZE = 1000;

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
  dashboard: (weeks: number, token?: string) =>
    request<DashboardResponse>(`/dashboard?weeks=${weeks}`, undefined, token),
  activitiesPage: (limit: number = ACTIVITY_PAGE_SIZE, offset: number = 0, token?: string) =>
    request<ActivitiesResponse>(`/activities?limit=${limit}&offset=${offset}`, undefined, token),
  activities: async (token?: string) => {
    const all: Activity[] = [];
    let offset = 0;
    while (true) {
      const page = await api.activitiesPage(ACTIVITY_PAGE_SIZE, offset, token);
      all.push(...page.activities);
      if (page.activities.length < ACTIVITY_PAGE_SIZE) {
        return { activities: all };
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
  ask: (question: string, weeks: number, token?: string) =>
    request<GroundedAnswer>(
      `/questions?weeks=${weeks}`,
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
    )
};
