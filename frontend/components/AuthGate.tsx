"use client";

import { useState } from "react";
import { Logo } from "./Logo";
import { Badge, Button, Card, CardContent, Input } from "./ui";

export function AuthGate({
  onSubmit,
  message
}: {
  onSubmit: (mode: "sign-in" | "sign-up", email: string, password: string) => Promise<void>;
  message?: string;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handle(event?: { preventDefault?: () => void }) {
    event?.preventDefault?.();
    if (submitting || !email || !password) return;
    setSubmitting(true);
    try {
      await onSubmit(mode, email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-[420px]">
        <CardContent className="gap-5 p-7">
          <div className="flex items-center gap-2.5">
            <Logo size={36} className="text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold">RideSense</span>
              <span className="text-[11px] text-muted-foreground">v 0.4 · beta</span>
            </div>
          </div>
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-tight">
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </h1>
            <p className="m-0 mt-1.5 text-[13px] text-muted-foreground">
              Link TrainerRoad and Strava on one merged timeline. Ask grounded questions about progression, regression,
              load, and intensity.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={mode === "sign-in" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("sign-in")}
            >
              Sign in
            </Button>
            <Button
              variant={mode === "sign-up" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("sign-up")}
            >
              Create account
            </Button>
          </div>
          <form onSubmit={handle} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              <label htmlFor="email" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="password" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" variant="default" disabled={submitting || !email || !password}>
              {submitting ? "…" : mode === "sign-in" ? "Enter dashboard" : "Create RideSense account"}
            </Button>
          </form>
          {message ? (
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Badge variant="outline">Status</Badge>
              <span>{message}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
