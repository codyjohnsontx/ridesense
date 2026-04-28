"use client";

import type { Activity, AthleteProfile, ConfigStatus, DashboardResponse, GroundedAnswer } from "@/lib/api";
import { Icon } from "./icons";
import { PageHeader } from "./Shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "./ui";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function ActivitiesScreen({ activities }: { activities: Activity[] }) {
  return (
    <>
      <PageHeader eyebrow="Merged feed" title="Activities" subtitle="TrainerRoad and Strava on a single timeline." />
      <div className="px-8 py-5">
        <Card>
          <CardContent className="px-0 pt-2">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  {["Date", "Workout", "Sport", "Source", "Category", "Duration", "TSS"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground ${
                        i >= 5 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="mono px-4 py-3 text-muted-foreground">{formatDate(a.started_at)}</td>
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.sport_type}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10.5px]">
                        {a.source_priority === "strava"
                          ? "Strava"
                          : a.source_priority === "trainerroad"
                            ? "TrainerRoad"
                            : a.source_priority === "upload"
                              ? "Upload"
                              : a.source_priority}
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
                {activities.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                      No activities yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function ConnectionsScreen({
  dashboard,
  onLinkStrava,
  onLinkTrainerRoad,
  onSync,
  onUploadFile,
  syncing,
  uploading,
  config,
  message
}: {
  dashboard: DashboardResponse;
  onLinkStrava: () => void;
  onLinkTrainerRoad: () => void;
  onSync: () => void;
  onUploadFile: (file: File) => void;
  syncing: boolean;
  uploading: boolean;
  config: ConfigStatus | null;
  message?: string;
}) {
  const stravaConnection = dashboard.connections.find((c) => c.provider === "strava");
  const trConnection = dashboard.connections.find((c) => c.provider === "trainerroad");

  const cards = [
    {
      key: "strava",
      name: "Strava",
      description: "OAuth · activity feed, GPS, HR, power.",
      connection: stravaConnection,
      action: onLinkStrava,
      cta:
        config && !config.strava_configured
          ? "Strava not configured"
          : stravaConnection
            ? "Relink Strava"
            : "Link Strava",
      disabled: Boolean(config && !config.strava_configured)
    },
    {
      key: "trainerroad",
      name: "TrainerRoad",
      description: "Browser-session linking · workouts, planned TSS, ramp tests.",
      connection: trConnection,
      action: onLinkTrainerRoad,
      cta:
        config?.trainerroad_linking_configured
          ? trConnection
            ? "Relink TrainerRoad"
            : "Link TrainerRoad"
          : "TrainerRoad scaffolded",
      disabled: false
    }
  ];

  const successfulSyncStatuses = new Set(["ok", "succeeded", "completed"]);

  return (
    <>
      <PageHeader
        eyebrow="Sources"
        title="Connections"
        subtitle="Link providers, run syncs, audit history."
        right={
          <Button variant="default" size="sm" onClick={onSync} disabled={syncing}>
            <Icon name="zap" size={13} />
            {syncing ? "Syncing…" : "Sync all"}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-8 py-5">
        {message ? (
          <Card className="px-4 py-3 text-[13px] text-muted-foreground">{message}</Card>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cards.map((c) => {
            const status = c.connection?.status ?? "not connected";
            const variant: "success" | "warning" | "outline" =
              status === "connected" || status === "active"
                ? "success"
                : status === "stale" || status === "error"
                  ? "warning"
                  : "outline";
            return (
              <Card key={c.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{c.name}</CardTitle>
                    <Badge variant={variant}>● {status}</Badge>
                  </div>
                  <CardDescription>{c.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {c.connection ? (
                    <div className="mono text-[11.5px] text-muted-foreground">
                      Last update {new Date(c.connection.updated_at).toLocaleString()}
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-muted-foreground">Not yet linked.</div>
                  )}
                  <Button variant="outline" size="sm" onClick={c.action} disabled={c.disabled}>
                    <Icon name="plug" size={13} />
                    {c.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload activity file</CardTitle>
            <CardDescription>
              Drop a .gpx, .tcx, or .fit export here. Files are parsed locally on the
              backend, deduplicated against existing rides, and merged into your timeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-[12.5px] text-muted-foreground transition hover:bg-muted/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) onUploadFile(file);
              }}
            >
              <Icon name="zap" size={16} />
              <span>{uploading ? "Uploading…" : "Click to choose or drop a .gpx / .tcx / .fit file"}</span>
              <input
                type="file"
                accept=".gpx,.tcx,.fit"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync history</CardTitle>
            <CardDescription>Most recent {dashboard.sync_runs.length} runs</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pt-2">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  {["Run", "Provider", "Status", "Message"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.sync_runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="mono px-4 py-3 text-muted-foreground">#{r.id}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10.5px]">
                        {r.provider}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={successfulSyncStatuses.has(r.status) ? "success" : "warning"}
                        className="text-[10.5px]"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.message}</td>
                  </tr>
                ))}
                {dashboard.sync_runs.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                      No syncs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function ProfileScreen({
  email,
  profile,
  onChange,
  onSave,
  saving,
  onSignOut,
  showSignOut,
  message
}: {
  email?: string;
  profile: AthleteProfile;
  onChange: (next: AthleteProfile) => void;
  onSave: () => void;
  saving: boolean;
  onSignOut?: () => void;
  showSignOut?: boolean;
  message?: string;
}) {
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
        eyebrow="Athlete"
        title="Profile"
        subtitle="Context that grounds Ask answers and recommendations."
        right={
          showSignOut && onSignOut ? (
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-4 px-8 py-5 md:grid-cols-[1fr_1.5fr]">
        {message ? (
          <Card className="px-4 py-3 text-[13px] text-muted-foreground md:col-span-2">{message}</Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Account &amp; threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</span>
              <span className="mono text-[13px]">{email ?? "Demo mode"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Athlete context</CardTitle>
            <CardDescription>Saved with each grounded question.</CardDescription>
          </CardHeader>
          <CardContent>
            {fields.map((f) => (
              <div className="flex flex-col gap-1.5" key={f.key}>
                <label htmlFor={f.key} className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </label>
                <Textarea
                  id={f.key}
                  rows={f.rows}
                  value={profile[f.key]}
                  onChange={(event) => onChange({ ...profile, [f.key]: event.target.value })}
                />
              </div>
            ))}
            <div>
              <Button variant="default" size="sm" onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : "Save context"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function PlaceholderScreen({
  title,
  subtitle,
  body
}: {
  title: string;
  subtitle?: string;
  body: string;
}) {
  return (
    <>
      <PageHeader eyebrow="Coming soon" title={title} subtitle={subtitle} />
      <div className="px-8 py-5">
        <Card>
          <CardContent className="items-start py-10">
            <Badge variant="outline">Preview</Badge>
            <p className="m-0 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{body}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function AskScreen({
  question,
  onChange,
  onAsk,
  asking,
  answer
}: {
  question: string;
  onChange: (q: string) => void;
  onAsk: () => void;
  asking: boolean;
  answer: GroundedAnswer | null;
}) {
  return (
    <>
      <PageHeader eyebrow="Grounded" title="Ask" subtitle="Conversational queries that cite every metric." />
      <div className="grid grid-cols-1 gap-4 px-8 py-5">
        <Card>
          <CardHeader>
            <CardTitle>Question</CardTitle>
            <CardDescription>Phrase it naturally — answers cite the metrics they used.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={3}
              value={question}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Am I trending toward better endurance fitness?"
            />
            <div>
              <Button variant="default" size="sm" onClick={onAsk} disabled={asking || !question.trim()}>
                <Icon name="sparkles" size={13} />
                {asking ? "Thinking…" : "Ask"}
              </Button>
            </div>
          </CardContent>
        </Card>
        {answer ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Answer</CardTitle>
                <CardDescription>{answer.evidence.length} metrics cited</CardDescription>
              </div>
              <Badge
                variant={
                  answer.confidence === "high" ? "success" : answer.confidence === "medium" ? "warning" : "outline"
                }
              >
                ● {answer.confidence}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-[14px] leading-relaxed">{answer.answer}</p>
              {answer.evidence.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {answer.evidence.map((e) => (
                    <div key={e.metric_id} className="rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.label}</div>
                      <div className="mono num text-[15px] font-semibold">{e.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {answer.caveats.length > 0 ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Caveats</div>
                  <ul className="m-0 list-disc pl-5 text-[12.5px] text-muted-foreground">
                    {answer.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {answer.follow_up_questions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {answer.follow_up_questions.map((q) => (
                    <Button key={q} variant="outline" size="sm" onClick={() => onChange(q)}>
                      {q}
                    </Button>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
