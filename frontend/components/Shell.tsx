"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Badge, Button, Card } from "./ui";

export type ScreenId =
  | "dashboard"
  | "rides"
  | "plan"
  | "compare"
  | "ask"
  | "connections"
  | "profile";

const NAV: Array<{ id: ScreenId; icon: IconName; label: string }> = [
  { id: "dashboard", icon: "home", label: "Dashboard" },
  { id: "rides", icon: "bike", label: "Activities" },
  { id: "plan", icon: "calendar", label: "Plan" },
  { id: "compare", icon: "log", label: "Compare blocks" },
  { id: "ask", icon: "sparkles", label: "Ask" },
  { id: "connections", icon: "plug", label: "Connections" },
  { id: "profile", icon: "user", label: "Profile" }
];

type ShellProps = {
  active: ScreenId;
  onNav: (id: ScreenId) => void;
  lastSync?: string | null;
  syncStatus?: "ok" | "error" | "stale";
  onSyncNow?: () => void;
  syncing?: boolean;
  children: ReactNode;
};

export function Shell({ active, onNav, lastSync, syncStatus = "ok", onSyncNow, syncing, children }: ShellProps) {
  const syncBadge =
    syncStatus === "error" ? (
      <Badge variant="destructive">● Error</Badge>
    ) : syncStatus === "stale" ? (
      <Badge variant="warning">● Stale</Badge>
    ) : (
      <Badge variant="success">● Synced</Badge>
    );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-[232px] flex-none flex-col gap-3.5 border-r border-border bg-background px-3 py-4">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Icon name="activity" size={15} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">RideSense</span>
            <span className="text-[11px] text-muted-foreground">v 0.4 · beta</span>
          </div>
        </div>
        <nav className="flex flex-col gap-px">
          {NAV.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNav(item.id)}
                className={`flex items-center gap-2.5 rounded-md border-0 px-2.5 py-2 text-left text-[13.5px] cursor-pointer transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
              >
                <Icon name={item.icon} size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Card className="px-3 py-2.5 shadow-none">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-muted-foreground">Last sync</span>
              {syncBadge}
            </div>
            <div className="mono mt-1.5 text-[11px] text-muted-foreground">
              {lastSync ?? "Never · link a provider"}
            </div>
          </Card>
          <Button variant="outline" size="sm" onClick={onSyncNow} disabled={syncing}>
            <Icon name="refresh" size={13} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">{children}</div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border px-8 pb-4 pt-6">
      <div>
        {eyebrow ? <div className="mb-1.5 text-xs text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="m-0 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </header>
  );
}
