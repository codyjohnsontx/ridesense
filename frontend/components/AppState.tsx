"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type Activity,
  api,
  type AthleteProfile,
  type ConfigStatus,
  DEFAULT_TIME_RANGE,
  type DashboardResponse,
  type GroundedAnswer,
  type TimeRange
} from "@/lib/api";
import { parseTimeRange, applyTimeRangeToSearchParams } from "@/lib/timeRange";
import { type AuthSession, supabase, supabaseConfigured } from "@/lib/supabase";

const emptyProfile: AthleteProfile = {
  event_type: "",
  goals: "",
  constraints: "",
  recovery_notes: "",
  training_days: ""
};

type SyncStatus = "ok" | "error" | "stale";

type AppStateValue = {
  dashboard: DashboardResponse | null;
  activities: Activity[];
  totalActivities: number;
  configStatus: ConfigStatus | null;
  profile: AthleteProfile;
  session: AuthSession | null;
  authMessage: string;
  authReady: boolean;
  question: string;
  answer: GroundedAnswer | null;
  asking: boolean;
  savingProfile: boolean;
  syncing: boolean;
  uploading: boolean;
  message: string;
  timeRange: TimeRange;
  rangeDays: number;
  lastSync: string | null;
  syncStatus: SyncStatus;
  setQuestion: (next: string) => void;
  setProfile: (next: AthleteProfile) => void;
  setTimeRange: (next: TimeRange) => void;
  clearMessage: () => void;
  submitAuth: (mode: "sign-in" | "sign-up", email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncAll: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  ask: () => Promise<void>;
  saveProfile: () => Promise<void>;
  linkStrava: () => Promise<void>;
  linkTrainerRoad: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

function pickLastSync(d: DashboardResponse | null) {
  if (!d) return null;
  const stamps = d.connections.map((c) => c.updated_at).filter((s): s is string => Boolean(s));
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (a > b ? a : b));
}

function formatLastSync(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rangeDaysFor(range: TimeRange, activities: Activity[]) {
  if (range.mode !== "all") return range.days;
  if (activities.length === 0) return DEFAULT_TIME_RANGE.days;
  const times = activities.map((a) => new Date(a.started_at).getTime()).filter(Number.isFinite);
  if (times.length === 0) return DEFAULT_TIME_RANGE.days;
  const span = Math.floor((Math.max(...times) - Math.min(...times)) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, span);
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const timeRange = useMemo(() => parseTimeRange(searchParams), [searchKey]);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalActivities, setTotalActivities] = useState(0);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [profile, setProfile] = useState<AthleteProfile>(emptyProfile);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [question, setQuestion] = useState("Am I trending toward better endurance fitness?");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [, startLoad] = useTransition();
  const accessToken = session?.access_token;
  const loadVersion = useRef(0);

  const setTimeRange = (next: TimeRange) => {
    const params = new URLSearchParams(searchKey);
    applyTimeRangeToSearchParams(params, next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const status = params.get("status");
    const callbackMessage = params.get("message");
    if (provider && status && callbackMessage) {
      setMessage(callbackMessage);
      params.delete("provider");
      params.delete("status");
      params.delete("message");
      const nextQuery = params.toString();
      window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
    }
  }, []);

  const load = (overrideToken?: string, selectedRange: TimeRange = timeRange) => {
    const token = overrideToken ?? accessToken;
    const thisVersion = ++loadVersion.current;

    startLoad(async () => {
      try {
        const [dashboardData, profileData, activitiesData] = await Promise.all([
          api.dashboard(selectedRange, token),
          api.profile(token),
          api.activities(selectedRange, token)
        ]);

        let configData: ConfigStatus | null = null;
        try {
          configData = await api.configStatus(token);
        } catch {
          configData = null;
        }

        if (loadVersion.current !== thisVersion) return;
        setDashboard(dashboardData);
        setProfile(profileData);
        setActivities(activitiesData.activities);
        setTotalActivities(activitiesData.total_activities ?? dashboardData.analysis.meta.total_activities);
        setConfigStatus(configData);
      } catch (err) {
        if (loadVersion.current !== thisVersion) return;
        setMessage(err instanceof Error ? err.message : "Failed to load athlete data.");
      }
    });
  };

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      load(undefined, timeRange);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) {
        load(data.session.access_token, timeRange);
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
      load(session.access_token, timeRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  useEffect(() => {
    if (!dashboard && supabaseConfigured && !session) return;
    setAnswer(null);
    load(accessToken, timeRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, pathname]);

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
    setTotalActivities(0);
    setMessage("");
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const run = await api.startSync("all", accessToken);
      setMessage(run.message || `Sync ${run.status}`);
      load(accessToken, timeRange);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function uploadFile(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      const result = await api.uploadActivity(file, accessToken);
      setMessage(`Imported ${result.name} (${Math.round(result.duration_seconds / 60)} min).`);
      load(accessToken, timeRange);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const response = await api.ask(question, timeRange, accessToken);
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
      setMessage("Goals & context saved.");
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

  const rangeDays = useMemo(() => rangeDaysFor(timeRange, activities), [timeRange, activities]);
  const lastSync = useMemo(() => formatLastSync(pickLastSync(dashboard)), [dashboard]);
  const syncStatus: SyncStatus = useMemo(() => {
    if (!dashboard) return "ok";
    if (dashboard.connections.length === 0) return "stale";
    if (dashboard.connections.some((c) => c.status === "error")) return "error";
    if (dashboard.connections.some((c) => c.status === "stale")) return "stale";
    return "ok";
  }, [dashboard]);

  const value: AppStateValue = {
    dashboard,
    activities,
    totalActivities,
    configStatus,
    profile,
    session,
    authMessage,
    authReady,
    question,
    answer,
    asking,
    savingProfile,
    syncing,
    uploading,
    message,
    timeRange,
    rangeDays,
    lastSync,
    syncStatus,
    setQuestion,
    setProfile,
    setTimeRange,
    clearMessage: () => setMessage(""),
    submitAuth,
    signOut,
    syncAll,
    uploadFile,
    ask,
    saveProfile,
    linkStrava,
    linkTrainerRoad
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return value;
}
