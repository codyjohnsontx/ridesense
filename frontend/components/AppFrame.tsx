"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { Shell } from "@/components/Shell";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { supabaseConfigured } from "@/lib/supabase";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <AppStateProvider>
      <AppFrameInner>{children}</AppFrameInner>
    </AppStateProvider>
  );
}

function AppFrameInner({ children }: { children: ReactNode }) {
  const { authReady, session, authMessage, submitAuth, lastSync, syncStatus, syncAll, syncing, timeRange } =
    useAppState();

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
    <Shell lastSync={lastSync} syncStatus={syncStatus} onSyncNow={syncAll} syncing={syncing} timeRange={timeRange}>
      {children}
    </Shell>
  );
}
