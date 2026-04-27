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
  sync_runs: Array<{ id: number; provider: string; status: string; message: string }>;
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  dashboard: (token?: string) => request<DashboardResponse>("/dashboard?weeks=12", undefined, token),
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
  ask: (question: string, token?: string) =>
    request<GroundedAnswer>(
      "/questions",
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
