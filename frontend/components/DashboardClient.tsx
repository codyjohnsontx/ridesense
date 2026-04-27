"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { api, AthleteProfile, DashboardResponse, GroundedAnswer } from "@/lib/api";
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

function pickLastSync(d: DashboardResponse | null) {
  if (!d) return null;
  const stamps = d.connections.map((c) => c.updated_at).filter(Boolean);
  if (stamps.length === 0) return null;
  return stamps.sort().reverse()[0];
}

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [profile, setProfile] = useState<AthleteProfile>(emptyProfile);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [active, setActive] = useState<ScreenId>("dashboard");
  const [range, setRange] = useState<"4w" | "12w" | "6mo" | "1y">("12w");
  const [question, setQuestion] = useState("Am I trending toward better endurance fitness?");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [, startLoad] = useTransition();
  const accessToken = session?.access_token;

  const load = () => {
    startLoad(async () => {
      try {
        const [dashboardData, profileData] = await Promise.all([
          api.dashboard(accessToken),
          api.profile(accessToken)
        ]);
        setDashboard(dashboardData);
        setProfile(profileData);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to load dashboard.");
      }
    });
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
        load();
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
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

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
    setMessage("");
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const run = await api.startSync("all", accessToken);
      setMessage(run.message || `Sync ${run.status}`);
      load();
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
      const response = await api.ask(question, accessToken);
      setAnswer(response);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ask failed.");
    } finally {
      setAsking(false);
    }
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
          onRangeChange={setRange}
          onSync={syncAll}
          syncing={syncing}
          question={question}
          onQuestionChange={setQuestion}
          onAsk={ask}
          asking={asking}
          answer={answer}
          message={message}
          onClearMessage={() => setMessage("")}
        />
      ) : active === "rides" ? (
        <ActivitiesScreen dashboard={dashboard} />
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
