"use client";

import { useEffect, useState, useTransition } from "react";
import { api, AthleteProfile, DashboardResponse, GroundedAnswer } from "@/lib/api";
import { AuthSession, supabase, supabaseConfigured } from "@/lib/supabase";

const emptyProfile: AthleteProfile = {
  event_type: "",
  goals: "",
  constraints: "",
  recovery_notes: "",
  training_days: ""
};

function loadForActivity(activity: { tss: number | null; estimated_load: number | null }) {
  return activity.tss ?? activity.estimated_load ?? 0;
}

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [profile, setProfile] = useState<AthleteProfile>(emptyProfile);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [question, setQuestion] = useState("Am I trending toward better endurance fitness?");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [message, setMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const accessToken = session?.access_token;

  const load = () => {
    startTransition(async () => {
      const [dashboardData, profileData] = await Promise.all([
        api.dashboard(accessToken),
        api.profile(accessToken)
      ]);
      setDashboard(dashboardData);
      setProfile(profileData);
    });
  };

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      load();
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
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
  }, []);

  useEffect(() => {
    if (supabaseConfigured && session) {
      load();
    }
  }, [session?.access_token]);

  async function submitAuth() {
    if (!supabase) {
      return;
    }
    setAuthMessage("");
    const result =
      authMode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }

    if (authMode === "sign-up" && !result.data.session) {
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

  if (supabaseConfigured && !session) {
    return (
      <main className="shell auth-shell">
        <section className="auth-panel">
          <p className="eyebrow">Cycling intelligence</p>
          <h1 className="brand">RideSense</h1>
          <p className="lede">
            Link TrainerRoad and Strava, merge your rides, and ask grounded questions about
            progress, regression, load, and intensity.
          </p>
          <div className="form auth-form">
            <div className="auth-toggle">
              <button
                className={authMode === "sign-in" ? "button" : "button secondary"}
                onClick={() => setAuthMode("sign-in")}
              >
                Sign in
              </button>
              <button
                className={authMode === "sign-up" ? "button" : "button secondary"}
                onClick={() => setAuthMode("sign-up")}
              >
                Create account
              </button>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button className="button" onClick={submitAuth}>
              {authMode === "sign-in" ? "Enter dashboard" : "Create RideSense account"}
            </button>
            {authMessage ? <p className="lede">{authMessage}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  if (!dashboard) {
    return <main className="shell">Loading RideSense...</main>;
  }

  const zones = dashboard.analysis.zone_breakdown;
  const maxZoneLoad = Math.max(...Object.values(zones).map((zone) => zone.load), 1);
  const latestActivities = dashboard.analysis.top_workouts.slice(0, 6);
  const stravaConnected = dashboard.connections.some((item) => item.provider === "strava");
  const trainerRoadConnected = dashboard.connections.some((item) => item.provider === "trainerroad");

  async function saveProfile() {
    await api.saveProfile(profile, accessToken);
    setMessage("Athlete context saved.");
  }

  async function askQuestion() {
    const response = await api.ask(question, accessToken);
    setAnswer(response);
  }

  async function syncAll() {
    const run = await api.startSync("all", accessToken);
    setMessage(run.message || `Sync ${run.status}`);
    load();
  }

  async function linkStrava() {
    const response = await api.startStravaLink(accessToken);
    window.location.href = response.authorization_url;
  }

  async function linkTrainerRoad() {
    const response = await api.startTrainerRoadLink(accessToken);
    setMessage(response.message);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">TrainerRoad + Strava intelligence</p>
          <h1 className="brand">RideSense</h1>
        </div>
        <p className="lede">
          One merged cycling timeline for load trend, zone distribution, progression, regression,
          and athlete-specific questions. Deterministic metrics first, AI interpretation second.
        </p>
        <div className="account-strip">
          <span>{supabaseConfigured ? session?.user.email : "Demo mode"}</span>
          {supabaseConfigured ? (
            <button className="button secondary" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Current trajectory</h2>
          <div className="metric-row">
            <div className="metric">
              <strong>{dashboard.analysis.summary.avg_weekly_load}</strong>
              <span>Avg weekly load</span>
            </div>
            <div className="metric">
              <strong>{dashboard.analysis.summary.trend_pct}%</strong>
              <span>Trend</span>
            </div>
            <div className="metric">
              <strong>{dashboard.analysis.meta.recent_activities}</strong>
              <span>Recent rides</span>
            </div>
            <div className="metric">
              <strong>{dashboard.analysis.summary.total_recent_load}</strong>
              <span>Window load</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Connections</h2>
          <p className="lede">
            Strava uses OAuth. TrainerRoad linking is browser-session based and must not store a
            TrainerRoad password.
          </p>
          <div className="actions">
            <button className="button" onClick={linkStrava}>
              {stravaConnected ? "Relink Strava" : "Link Strava"}
            </button>
            <button className="button secondary" onClick={linkTrainerRoad}>
              {trainerRoadConnected ? "Relink TrainerRoad" : "Link TrainerRoad"}
            </button>
            <button className="button secondary" onClick={syncAll} disabled={isPending}>
              Sync all
            </button>
          </div>
          {message ? <p className="lede">{message}</p> : null}
        </div>

        <div className="panel">
          <h2>Zone distribution</h2>
          <div className="bars">
            {Object.entries(zones).map(([zone, data]) => (
              <div className="bar-row" key={zone}>
                <span>{zone}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(data.load / maxZoneLoad) * 100}%` }} />
                </div>
                <span>{data.load}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Signals</h2>
          {dashboard.insights.map((insight) => (
            <article className="insight" key={insight.title}>
              <p className="eyebrow">{insight.level}</p>
              <h3>{insight.title}</h3>
              <p>{insight.body}</p>
            </article>
          ))}
        </div>

        <div className="panel">
          <h2>Ask your data</h2>
          <div className="form">
            <div className="field">
              <label htmlFor="question">Question</label>
              <textarea
                id="question"
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </div>
            <button className="button" onClick={askQuestion}>
              Ask
            </button>
          </div>
          {answer ? (
            <div className="insight">
              <p className="eyebrow">Confidence: {answer.confidence}</p>
              <p className="answer">{answer.answer}</p>
              {answer.evidence.map((point) => (
                <p key={point.metric_id}>
                  {point.label}: {point.value}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="panel">
          <h2>Athlete context</h2>
          <div className="form">
            {(["event_type", "goals", "constraints", "recovery_notes", "training_days"] as const).map((key) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{key.replaceAll("_", " ")}</label>
                <textarea
                  id={key}
                  rows={key === "goals" ? 3 : 2}
                  value={profile[key]}
                  onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                />
              </div>
            ))}
            <button className="button secondary" onClick={saveProfile}>
              Save context
            </button>
          </div>
        </div>

        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Top stress contributors</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Workout</th>
                <th>Source</th>
                <th>Category</th>
                <th>Load</th>
              </tr>
            </thead>
            <tbody>
              {latestActivities.map((activity) => (
                <tr key={activity.id}>
                  <td>{new Date(activity.started_at).toLocaleDateString()}</td>
                  <td>{activity.name}</td>
                  <td>{activity.source_priority}</td>
                  <td>{activity.workout_category ?? "Unclassified"}</td>
                  <td>{loadForActivity(activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
