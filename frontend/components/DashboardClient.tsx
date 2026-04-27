"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, api, AthleteProfile, ConfigStatus, DashboardResponse, GroundedAnswer } from "@/lib/api";
import { AuthSession, supabase, supabaseConfigured } from "@/lib/supabase";
import { AuthGate } from "./AuthGate";
import { Dashboard, formatLastSync } from "./Dashboard";
import { Shell, type ScreenId } from "./Shell";
import { Card, CardContent, Skeleton } from "./ui";
import { ActivitiesScreen, AskScreen, ConnectionsScreen, PlaceholderScreen, ProfileScreen } from "./screens";

const emptyProfile: AthleteProfile = {
  event_type: "",
  goals: "",
  constraints: "",
  recovery_notes: "",
  training_days: ""
};

type Range = "4w" | "12w" | "6mo" | "1y";

const WEEKS_FOR_RANGE: Record<Range, number> = {
  "4w": 4,
  "12w": 12,
  "6mo": 26,
  "1y": 52
};

function pickLastSync(d: DashboardResponse | null) {
  if (!d) return null;
  const stamps = d.connections
    .map((c) => c.updated_at)
    .filter((s): s is string => Boolean(s));
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (a > b ? a : b));
}

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [profile, setProfile] = useState<AthleteProfile>(emptyProfile);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [active, setActive] = useState<ScreenId>("dashboard");
  const [range, setRange] = useState<Range>("12w");
  const [question, setQuestion] = useState("Am I trending toward better endurance fitness?");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [, startLoad] = useTransition();
  const accessToken = session?.access_token;
  const loadVersion = useRef(0);
  const staticLoadVersion = useRef(0);

  const loadDashboard = (overrideToken?: string, weeks: number = WEEKS_FOR_RANGE[range]) => {
    const token = overrideToken ?? accessToken;
    const thisVersion = ++loadVersion.current;
    startLoad(async () => {
      try {
        const dashboardData = await api.dashboard(weeks, token);
        if (loadVersion.current !== thisVersion) return;
        setDashboard(dashboardData);
      } catch (err) {
        if (loadVersion.current !== thisVersion) return;
        setMessage(err instanceof Error ? err.message : "Failed to load dashboard.");
      }
    });
  };

  const loadStaticData = (overrideToken?: string) => {
    const token = overrideToken ?? accessToken;
    const thisVersion = ++staticLoadVersion.current;
    startLoad(async () => {
      try {
        const [profileData, activitiesData] = await Promise.all([api.profile(token), api.activities(token)]);
        let configData: ConfigStatus | null = null;
        try {
          configData = await api.configStatus(token);
        } catch {
          configData = null;
        }
        if (staticLoadVersion.current !== thisVersion) return;
        setProfile(profileData);
        setActivities(activitiesData.activities);
        setConfigStatus(configData);
      } catch (err) {
        if (staticLoadVersion.current !== thisVersion) return;
        setMessage(err instanceof Error ? err.message : "Failed to load athlete data.");
      }
    });
  };

  const load = (overrideToken?: string, weeks: number = WEEKS_FOR_RANGE[range], includeStatic = true) => {
    loadDashboard(overrideToken, weeks);
    if (includeStatic) {
      loadStaticData(overrideToken);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const status = params.get("status");
    const callbackMessage = params.get("message");
    if (provider && status && callbackMessage) {
      setMessage(callbackMessage);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!supabaseConfigured || !supabase) {
      load();
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) {
        load(data.session.access_token);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setDashboard(null);
        setAuthMessage("");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (supabaseConfigured && session) {
      load(session.access_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  useEffect(() => {
    if (!dashboard) return;
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function submitAuth(mode: "sign-in" | "sign-up", email: string, password: string) {
    if (!supabase) return;
    setAuthMessage("");
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }
    if (mode === "sign-up" && !result.data.session) {
      setAuthMessage("Check your email to confirm the account, then sign in.");
      return;
    }
    setSession(result.data.session);
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setDashboard(null);
    setActivities([]);
    setMessage("");
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const run = await api.startSync("all", accessToken);
      setMessage(run.message || `Sync ${run.status}`);
      load(accessToken, WEEKS_FOR_RANGE[range], true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const response = await api.ask(question, WEEKS_FOR_RANGE[range], accessToken);
      setAnswer(response);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ask failed.");
    } finally {
      setAsking(false);
    }
  }

  function exportActivities() {
    const headers = ["Date", "Workout", "Sport", "Source", "Category", "Duration seconds", "TSS", "Estimated load"];
    const safeCsvCell = (cell: string) => {
      const safeValue = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };
    const rows = activities.map((a) => [
      a.started_at,
      a.name,
      a.sport_type,
      a.source_priority,
      a.workout_category ?? "",
      String(a.duration_seconds),
      a.tss == null ? "" : String(a.tss),
      a.estimated_load == null ? "" : String(a.estimated_load)
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(safeCsvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ridesense-activities.csv";
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${activities.length} activities.`);
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const next = await api.saveProfile(profile, accessToken);
      setProfile(next);
      setMessage("Athlete context saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function linkStrava() {
    try {
      const response = await api.startStravaLink(accessToken);
      window.location.href = response.authorization_url;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start Strava link.");
    }
  }

  async function linkTrainerRoad() {
    try {
      const response = await api.startTrainerRoadLink(accessToken);
      setMessage(response.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start TrainerRoad link.");
    }
  }

  const lastSync = useMemo(() => formatLastSync(pickLastSync(dashboard)), [dashboard]);
  const syncStatus: "ok" | "stale" | "error" = useMemo(() => {
    if (!dashboard) return "ok";
    if (dashboard.connections.length === 0) return "stale";
    if (dashboard.connections.some((c) => c.status === "error")) return "error";
    if (dashboard.connections.some((c) => c.status === "stale")) return "stale";
    return "ok";
  }, [dashboard]);

  if (supabaseConfigured && !authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-[320px]">
          <CardContent>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (supabaseConfigured && !session) {
    return <AuthGate onSubmit={submitAuth} message={authMessage} />;
  }

  return (
    <Shell
      active={active}
      onNav={setActive}
      lastSync={lastSync}
      syncStatus={syncStatus}
      onSyncNow={syncAll}
      syncing={syncing}
    >
      {!dashboard ? (
        <DashboardSkeleton />
      ) : active === "dashboard" ? (
        <Dashboard
          dashboard={dashboard}
          range={range}
          rangeDays={WEEKS_FOR_RANGE[range] * 7}
          onRangeChange={setRange}
          onSync={syncAll}
          syncing={syncing}
          question={question}
          onQuestionChange={setQuestion}
          onAsk={ask}
          asking={asking}
          answer={answer}
          activities={activities}
          onExport={exportActivities}
          message={message}
          onClearMessage={() => setMessage("")}
        />
      ) : active === "rides" ? (
        <ActivitiesScreen activities={activities} />
      ) : active === "ask" ? (
        <AskScreen
          question={question}
          onChange={setQuestion}
          onAsk={ask}
          asking={asking}
          answer={answer}
        />
      ) : active === "connections" ? (
        <ConnectionsScreen
          dashboard={dashboard}
          onLinkStrava={linkStrava}
          onLinkTrainerRoad={linkTrainerRoad}
          onSync={syncAll}
          syncing={syncing}
          config={configStatus}
          message={message}
        />
      ) : active === "profile" ? (
        <ProfileScreen
          email={session?.user.email ?? "Demo mode"}
          profile={profile}
          onChange={setProfile}
          onSave={saveProfile}
          saving={savingProfile}
          onSignOut={signOut}
          showSignOut={Boolean(supabaseConfigured && session)}
          message={message}
        />
      ) : active === "plan" ? (
        <PlaceholderScreen
          title="Plan"
          subtitle="14-day calendar with planned vs actual TSS."
          body="Coming soon: drag-to-move workouts, weekly rollups, and an end-of-block CTL/ATL/TSB projection."
        />
      ) : (
        <PlaceholderScreen
          title="Compare blocks"
          subtitle="Block-over-block fitness and load."
          body="Coming soon: overlay this 4-week block against the same window last cycle, with an auto-narrative of top deltas."
        />
      )}
    </Shell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-8 py-6">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
