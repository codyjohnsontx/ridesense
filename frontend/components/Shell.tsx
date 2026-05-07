"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Logo } from "./Logo";
import { Badge, Button, Card } from "./ui";
import type { TimeRange } from "@/lib/api";
import { withTimeRange } from "@/lib/timeRange";

const NAV: Array<{ href: string; icon: IconName; label: string; rangeAware?: boolean }> = [
  { href: "/", icon: "home", label: "Overview", rangeAware: true },
  { href: "/training", icon: "activity", label: "Training", rangeAware: true },
  { href: "/activities", icon: "bike", label: "Activities", rangeAware: true },
  { href: "/ask", icon: "sparkles", label: "Ask", rangeAware: true },
  { href: "/connections", icon: "plug", label: "Connections" },
  { href: "/athlete-context", icon: "user", label: "Athlete Context" }
];

type ShellProps = {
  lastSync?: string | null;
  syncStatus?: "ok" | "error" | "stale";
  onSyncNow?: () => void;
  syncing?: boolean;
  timeRange: TimeRange;
  children: ReactNode;
};

export function Shell({ lastSync, syncStatus = "ok", onSyncNow, syncing, timeRange, children }: ShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const syncBadge =
    syncStatus === "error" ? (
      <Badge variant="destructive">● Error</Badge>
    ) : syncStatus === "stale" ? (
      <Badge variant="warning">● Stale</Badge>
    ) : (
      <Badge variant="success">● Synced</Badge>
    );

  const hrefFor = (href: string, rangeAware?: boolean) => (rangeAware ? withTimeRange(href, timeRange) : href);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const navContent = (
    <>
      <div className="flex items-center gap-2.5 px-2 py-1">
        <Logo size={28} className="text-primary" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">RideSense</span>
          <span className="text-[11px] text-muted-foreground">v 0.4 · beta</span>
        </div>
      </div>
      <nav className="flex flex-col gap-px">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={hrefFor(item.href, item.rangeAware)}
              className={`flex items-center gap-2.5 rounded-md border-0 px-2.5 py-2 text-left text-[13.5px] no-underline transition-colors ${
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[232px] flex-none flex-col gap-3.5 border-r border-border bg-background px-3 py-4 lg:flex">
        {navContent}
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

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
              <Icon name="menu" size={18} />
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <Logo size={22} className="text-primary" />
              <span className="truncate text-sm font-semibold">RideSense</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex">{syncBadge}</div>
            <Button variant="outline" size="sm" onClick={onSyncNow} disabled={syncing} className="px-2.5 sm:px-3">
              <Icon name="refresh" size={13} />
              <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync"}</span>
            </Button>
          </div>
        </header>

        {menuOpen ? (
          <div className="fixed inset-0 z-40 bg-background lg:hidden">
            <div className="flex h-full flex-col gap-4 px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Logo size={24} className="text-primary" />
                  <span className="text-sm font-semibold">RideSense</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
                  <Icon name="x" size={18} />
                </Button>
              </div>
              <div className="flex flex-1 flex-col gap-4">
                {navContent}
              </div>
              <Card className="px-3 py-2.5 shadow-none">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted-foreground">Last sync</span>
                  {syncBadge}
                </div>
                <div className="mono mt-1.5 text-[11px] text-muted-foreground">{lastSync ?? "Never · link a provider"}</div>
              </Card>
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col bg-background">{children}</div>
      </div>
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
    <header className="flex flex-col gap-4 border-b border-border px-4 pb-4 pt-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-6">
      <div>
        {eyebrow ? <div className="mb-1.5 text-xs text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="m-0 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </header>
  );
}
