"use client";

import { useState, type PointerEvent } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
const chartDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  timeZone: "UTC"
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function pointerX(event: PointerEvent<SVGSVGElement>, width: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  return ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
}

function formatChartDate(date: Date) {
  return chartDateFormatter.format(date);
}

export function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return chartDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

function dateAtIndex(endDate: Date, index: number, total: number) {
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return new Date(end - (total - 1 - index) * DAY_MS);
}

function MetricLabel({ label, title }: { label: string; title: string }) {
  return (
    <abbr title={title} className="cursor-default no-underline decoration-dotted underline-offset-2 hover:underline">
      {label}
    </abbr>
  );
}

type FormFitnessCurveProps = {
  ctl: number[];
  atl: number[];
  tsb: number[];
  endDate?: Date;
  w?: number;
  h?: number;
};

export function FormFitnessCurve({ ctl, atl, tsb, endDate = new Date(), w = 720, h = 220 }: FormFitnessCurveProps) {
  const [hover, setHover] = useState<{ index: number; x: number } | null>(null);
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const allPos = [...ctl, ...atl];
  const yMax = Math.max(...allPos, 1) * 1.1;
  const tsbMax = Math.max(...tsb.map((v) => Math.abs(v)), 1) * 1.2;
  const xAt = (i: number, n: number) => padL + (i / Math.max(1, n - 1)) * innerW;
  const yAt = (v: number) => padT + innerH - (v / yMax) * innerH;
  const tsbAxisY = padT + innerH * 0.78;
  const tsbY = (v: number) => tsbAxisY - (v / tsbMax) * (innerH * 0.18);

  const pathFor = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i, arr.length).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
  const tsbPath = tsb
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i, tsb.length).toFixed(1)} ${tsbY(v).toFixed(1)}`)
    .join(" ");

  const ticks = [0, 25, 50, 75, 100].filter((t) => t <= yMax);
  const activeIndex = ctl.length > 0 ? hover?.index ?? ctl.length - 1 : -1;
  const activePointX = activeIndex >= 0 ? xAt(activeIndex, ctl.length) : 0;
  const activeX = hover?.x ?? activePointX;
  const activeDate = activeIndex >= 0 ? dateAtIndex(endDate, activeIndex, ctl.length) : endDate;
  const startDate = ctl.length > 0 ? dateAtIndex(endDate, 0, ctl.length) : endDate;
  const activeTsb = activeIndex >= 0 ? tsb[activeIndex] ?? 0 : 0;
  const activeCtl = activeIndex >= 0 ? ctl[activeIndex] ?? 0 : 0;
  const activeAtl = activeIndex >= 0 ? atl[activeIndex] ?? 0 : 0;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (ctl.length === 0) return;
    const x = clamp(pointerX(event, w), padL, w - padR);
    const ratio = (x - padL) / Math.max(1, innerW);
    setHover({ index: clamp(Math.round(ratio * (ctl.length - 1)), 0, ctl.length - 1), x });
  }

  return (
    <div className="space-y-2">
      <div className="mono flex h-6 items-center gap-3 rounded-md border border-border bg-popover px-2.5 text-[11.5px] text-foreground">
        <span className="font-semibold">{formatChartDate(activeDate)}</span>
        <span className="text-muted-foreground">
          <MetricLabel label="Fitness" title="CTL: Chronic Training Load, your longer-term fitness trend." />{" "}
          <span className="text-foreground">{Math.round(activeCtl)}</span>
        </span>
        <span className="text-muted-foreground">
          <MetricLabel label="Fatigue" title="ATL: Acute Training Load, your recent fatigue from short-term training." />{" "}
          <span className="text-foreground">{Math.round(activeAtl)}</span>
        </span>
        <span className="text-muted-foreground">
          <MetricLabel label="Form" title="TSB: Training Stress Balance, your freshness/readiness. Fitness minus fatigue." />{" "}
          <span className={activeTsb < 0 ? "text-[hsl(var(--warning))]" : "text-foreground"}>
            {Math.round(activeTsb)}
          </span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerLeave={() => setHover(null)}
      >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - padR} y1={yAt(t)} y2={yAt(t)} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.5" />
          <text
            x={padL - 6}
            y={yAt(t) + 3}
            fontSize="10"
            textAnchor="end"
            fill="hsl(var(--muted-foreground))"
            className="mono"
            opacity="0.7"
          >
            {t}
          </text>
        </g>
      ))}
      <line
        x1={padL}
        x2={w - padR}
        y1={tsbAxisY}
        y2={tsbAxisY}
        stroke="hsl(var(--border))"
        strokeDasharray="2 3"
        strokeWidth="1"
      />
      <path d={pathFor(atl)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={pathFor(ctl)} fill="none" stroke="hsl(var(--foreground))" strokeWidth="2" strokeLinejoin="round" />
      <path
        d={tsbPath}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1"
        strokeDasharray="1 2"
      />
      {activeIndex >= 0 ? (
        <>
          <line
            x1={activeX}
            x2={activeX}
            y1={padT}
            y2={padT + innerH}
            stroke="hsl(var(--foreground))"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <circle
            cx={activePointX}
            cy={yAt(ctl[activeIndex] ?? 0)}
            r="3.5"
            fill="hsl(var(--foreground))"
          />
          <circle
            cx={activePointX}
            cy={yAt(atl[activeIndex] ?? 0)}
            r="3"
            fill="hsl(var(--muted-foreground))"
          />
        </>
      ) : null}
      <text x={padL} y={h - 6} fontSize="10" fill="hsl(var(--muted-foreground))" className="mono" opacity="0.7">
        {formatChartDate(startDate)}
      </text>
      <text x={w - padR} y={h - 6} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))" className="mono" opacity="0.7">
        {formatChartDate(endDate)}
      </text>
      </svg>
    </div>
  );
}

export function WeeklyLoadChart({
  weekly,
  w = 360,
  h = 110,
  highlight = -1
}: {
  weekly: Array<{ load: number; week_start: string }>;
  w?: number;
  h?: number;
  highlight?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (weekly.length === 0) return null;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 18;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...weekly.map((d) => d.load), 1);
  const bw = innerW / weekly.length;
  const avg = weekly.reduce((a, b) => a + b.load, 0) / weekly.length;
  const avgY = padT + innerH - (avg / max) * innerH;
  const hi = hoverIndex ?? (highlight < 0 ? weekly.length - 1 : highlight);
  const active = weekly[hi];

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const x = clamp(pointerX(event, w), padL, w - padR);
    setHoverIndex(clamp(Math.floor((x - padL) / Math.max(1, bw)), 0, weekly.length - 1));
  }

  return (
    <div className="space-y-1">
      <div className="mono h-4 text-[11.5px] text-foreground">
        {active ? (
          <>
            {formatDateOnly(active.week_start)} · {Math.round(active.load)} TSS
          </>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
      <line
        x1={padL}
        x2={w - padR}
        y1={avgY}
        y2={avgY}
        stroke="hsl(var(--muted-foreground))"
        strokeDasharray="2 3"
        strokeWidth="1"
        opacity="0.6"
      />
      <text
        x={w - padR - 2}
        y={avgY - 3}
        fontSize="9"
        fill="hsl(var(--muted-foreground))"
        textAnchor="end"
        className="mono"
        opacity="0.7"
      >
        AVG {Math.round(avg)}
      </text>
      {weekly.map((d, i) => {
        const bh = (d.load / max) * innerH;
        const x = padL + i * bw + 1;
        const y = padT + innerH - bh;
        const isHi = i === hi;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={Math.max(1, bw - 2)}
              height={bh}
              fill={isHi ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
              opacity={isHi ? 1 : 0.55}
            />
            {isHi ? (
              <text
                x={x + (bw - 2) / 2}
                y={y - 4}
                fontSize="9"
                textAnchor="middle"
                fill="hsl(var(--foreground))"
                className="mono"
              >
                {d.load}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={padL} y={h - 4} fontSize="9" fill="hsl(var(--muted-foreground))" className="mono" opacity="0.7">
        {weekly.length} WEEKS
      </text>
      </svg>
    </div>
  );
}

export function ZoneStackBar({
  zones,
  h = 14
}: {
  zones: Array<{ key: string; load: number; pct: number }>;
  h?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const total = zones.reduce((a, b) => a + b.load, 0) || 1;
  const active = hoverIndex === null ? null : zones[hoverIndex];
  return (
    <div className="space-y-1.5">
      <div className="mono h-4 text-[11px] text-foreground">
        {active ? `${active.key} · ${active.load} TSS · ${active.pct}%` : "Hover a zone for load"}
      </div>
      <div
        onPointerLeave={() => setHoverIndex(null)}
        style={{
          display: "flex",
          height: h,
          borderRadius: 2,
          overflow: "hidden",
          background: "hsl(var(--muted))",
          touchAction: "pan-y"
        }}
      >
        {zones.map((z, i) => (
          <div
            key={z.key}
            title={`${z.key}: ${z.load} TSS`}
            onPointerMove={() => setHoverIndex(i)}
            onPointerDown={() => setHoverIndex(i)}
            style={{
              flex: z.load / total,
              background: `hsl(var(--rs-z${i + 1}))`,
              opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.45
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function WeekHeatmap({
  daily,
  endDate = new Date(),
  w = 360,
  h = 62
}: {
  daily: number[];
  endDate?: Date;
  w?: number;
  h?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const weeks = Math.max(1, Math.ceil(daily.length / 7));
  const rows = 7;
  const maxCellByHeight = (h - (rows - 1)) / (rows * 0.8);
  const cellByWidth = Math.floor(w / weeks) - 2;
  const cell = Math.min(Math.max(6, cellByWidth), Math.floor(maxCellByHeight));
  const max = Math.max(...daily, 1);
  const active = hoverIndex === null ? null : daily[hoverIndex];

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const x = pointerX(event, w);
    const rect = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * h;
    const colTile = cell + 2;
    const rowTile = cell * 0.8 + 1;
    const modX = x % colTile;
    const modY = y % rowTile;
    if (modX >= cell || modY >= cell * 0.8) {
      setHoverIndex(null);
      return;
    }
    const wk = Math.floor(x / colTile);
    const dow = Math.floor(y / rowTile);
    const idx = wk * 7 + dow;
    if (idx >= 0 && idx < daily.length && dow >= 0 && dow < rows) {
      setHoverIndex(idx);
    } else {
      setHoverIndex(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="mono h-4 text-[11.5px] text-foreground">
        {hoverIndex === null
          ? "Hover a day"
          : `${formatChartDate(dateAtIndex(endDate, hoverIndex, daily.length))} · ${Math.round(active ?? 0)} TSS`}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
      {daily.map((v, i) => {
        const wk = Math.floor(i / 7);
        const dow = i % 7;
        const op = v === 0 ? 0.08 : 0.25 + (v / max) * 0.75;
        const isHi = i === hoverIndex;
        return (
          <rect
            key={i}
            x={wk * (cell + 2)}
            y={dow * (cell * 0.8 + 1)}
            width={cell}
            height={cell * 0.8}
            rx="1.5"
            fill="hsl(var(--foreground))"
            opacity={isHi ? 1 : op}
            stroke={isHi ? "hsl(var(--foreground))" : "none"}
            strokeWidth={isHi ? 1 : 0}
          />
        );
      })}
      </svg>
    </div>
  );
}
